import { banMessage } from './_ban.js';
import { mfaMissing, MFA_REQUIRED } from './_mfa.js';
import { releaseReserve, BUDGET_MESSAGE, EUR_PER_CREDIT } from './_budget.js';
const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';

// La création des cartes appelle l'IA : 10 s (valeur par défaut de Vercel) ne suffisent pas toujours.
export const config = { maxDuration: 60 };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Même modèle que generate.js et chat.js. Réglages de réflexion essayés dans l'ordre (voir generate.js).
const FLASH_MODEL = 'claude-sonnet-5-5';
const THINKING_OPTIONS = [{ type: 'disabled' }, { type: 'enabled', budget_tokens: 1024 }, null];
let thinkingOpt = 0;

// Suivi de consommation (même table que generate.js) : tarif Sonnet 5.5, 2 $ / 10 $ par million de tokens.
async function logApiUsage(SERVICE_KEY, email, kind, model, inTok, outTok, credits) {
  try {
    const cost = ((inTok || 0) * 2 + (outTok || 0) * 10) / 1e6;
    await fetch(SUPABASE_URL + '/rest/v1/api_usage', {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ user_email: email, kind: kind, model: model, input_tokens: inTok || 0, output_tokens: outTok || 0, cost_usd: cost, credits: (typeof credits === "number" ? credits : null) })
    });
  } catch (e) { console.error('Log usage:', e && e.message); }
}

// ── Algorithme FSRS-5 (Free Spaced Repetition Scheduler) ──
// rating : 1=Oubli, 2=Difficile, 3=Bien, 4=Facile
// Paramètres FSRS-5 par défaut (optimisés sur 20M+ révisions)
const FSRS_W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102,
  0.5316, 1.0651, 0.0589, 1.5330, 0.1544,
  1.0070, 1.9395, 0.1100, 0.2900, 2.2700,
  0.2500, 2.9898, 0.5100, 0.4300
];

function fsrsInitialStability(rating) {
  return Math.max(FSRS_W[rating - 1], 0.1);
}

// Formules FSRS-5 (corrigées le 22/10 : l'ancienne mise à jour de la difficulté ajoutait ~7 points à chaque
// révision, la difficulté montait à 10 et les intervalles grandissaient beaucoup trop lentement).
const FSRS_DECAY = -0.5;
const FSRS_FACTOR = 19 / 81;

function fsrsInitialDifficulty(rating) {
  return Math.min(Math.max(FSRS_W[4] - Math.exp(FSRS_W[5] * (rating - 1)) + 1, 1), 10);
}

function fsrsDifficulty(d, rating) {
  const deltaD = -FSRS_W[6] * (rating - 3);
  const dPrime = d + deltaD * (10 - d) / 9;
  const newD = FSRS_W[7] * fsrsInitialDifficulty(4) + (1 - FSRS_W[7]) * dPrime;
  return Math.min(Math.max(newD, 1), 10);
}

function fsrsRetrievability(elapsedDays, stability) {
  return Math.pow(1 + FSRS_FACTOR * elapsedDays / stability, FSRS_DECAY);
}

function fsrsNextStability(d, s, r, rating) {
  if (rating === 1) {
    // Oubli : stabilité de rappel
    const sf = FSRS_W[11] * Math.pow(d, -FSRS_W[12]) * (Math.pow(s + 1, FSRS_W[13]) - 1) * Math.exp((1 - r) * FSRS_W[14]);
    return Math.min(sf, s);
  }
  // Rappel réussi
  const hardPenalty = rating === 2 ? FSRS_W[15] : 1;
  const easyBonus = rating === 4 ? FSRS_W[16] : 1;
  return s * (Math.exp(FSRS_W[8]) * (11 - d) * Math.pow(s, -FSRS_W[9]) * (Math.exp((1 - r) * FSRS_W[10]) - 1) * hardPenalty * easyBonus + 1);
}

function fsrsNextInterval(stability, requestedRetention) {
  const rr = requestedRetention || 0.9;
  const interval = Math.round((stability / FSRS_FACTOR) * (Math.pow(rr, 1 / FSRS_DECAY) - 1));
  return Math.min(Math.max(interval, 1), 36500);
}

function schedule(card, rating) {
  // rating : 1=Oubli, 2=Difficile, 3=Bien, 4=Facile
  // Compatibilité avec l'ancien système quality 1/3/4/5 → rating 1/2/3/4
  if (rating === 5) rating = 4;
  if (rating === 3 && !card.stability) rating = 3;

  const now = new Date();
  const isNew = !card.stability || card.repetitions === 0;

  let stability, difficulty, interval;

  if (isNew) {
    // Première révision
    stability = fsrsInitialStability(rating);
    difficulty = fsrsInitialDifficulty(rating);
    if (rating === 1) {
      interval = 0; // Revoir immédiatement
    } else {
      interval = fsrsNextInterval(stability, 0.9);
    }
  } else {
    const s = card.stability || 1;
    const d = card.ease || 5; // On réutilise ease pour difficulty
    const lastReview = card.last_review ? new Date(card.last_review) : new Date(now - 86400000);
    const elapsedDays = Math.max((now - lastReview) / 86400000, 0.001);
    const r = fsrsRetrievability(elapsedDays, s);

    difficulty = fsrsDifficulty(d, rating);
    stability = fsrsNextStability(d, s, r, rating);

    if (rating === 1) {
      interval = 0; // Revoir immédiatement
    } else {
      interval = fsrsNextInterval(stability, 0.9);
    }
  }

  const due = new Date();
  if (interval > 0) due.setDate(due.getDate() + interval);

  return {
    interval_days: interval,
    ease: Math.round(difficulty * 100) / 100, // Réutiliser ease pour difficulty
    stability: Math.round(stability * 1000) / 1000,
    repetitions: (card.repetitions || 0) + 1,
    last_review: now.toISOString(),
    due_date: due.toISOString()
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    console.error('flashcards.js : SUPABASE_SERVICE_ROLE_KEY manquante.');
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }
  const sb = {
    'apikey': SERVICE_KEY,
    'Authorization': 'Bearer ' + SERVICE_KEY
  };

  // Mode maintenance : bloque tout le monde pendant que le site est en pause
  // Maintenance : tout le monde est bloqué, sauf le compte administrateur (vérifié après lecture du profil).
  let maintBlock = null;
  try {
    const maintRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_maintenance_status', {
      method: 'POST', headers: { ...sb, 'Content-Type': 'application/json' }, body: '{}'
    });
    const maint = await maintRes.json();
    if (maint && maint.hard_blocked) maintBlock = maint.message || 'FicheAI est en maintenance. On revient très vite !';
  } catch (e) { /* si la vérification échoue, on laisse passer */ }

  // Vérifie qu'un compte existe pour cet email, et qu'il n'est pas banni
  let banMsg = 'Ce compte a été suspendu.';
  async function requireUser(email) {
    if (!email) return null;
    const r = await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email) + '&select=email,banned_reason,banned_until,is_dev', { headers: sb });
    const u = await r.json();
    const found = (Array.isArray(u) && u[0]) ? u[0] : null;
    if (!found) return null;
    const banCheck = await fetch(SUPABASE_URL + '/rest/v1/rpc/is_user_banned', {
      method: 'POST', headers: { ...sb, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: email })
    });
    const isBanned = await banCheck.json();
    if (isBanned === true) { banMsg = banMessage(found); return 'BANNED'; }
    return found;
  }

  // ── Vérification token Supabase ──
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Connecte-toi pour accéder aux flashcards.' });
  let verifiedEmail;
  try {
    const authRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + token }
    });
    if (!authRes.ok) return res.status(401).json({ error: 'Session invalide, reconnecte-toi.' });
    const authData = await authRes.json();
    verifiedEmail = authData.email;
    if (!verifiedEmail) return res.status(401).json({ error: 'Session invalide.' });
    if (mfaMissing(token, authData)) return res.status(401).json(MFA_REQUIRED);
  } catch(e) {
    return res.status(503).json({ error: 'Service momentanément indisponible' });
  }

  // ─────────────── LECTURE (GET) ───────────────
  if (req.method === 'GET') {
    const email = verifiedEmail;
    if (!email) return res.status(401).json({ error: 'Non connecté' });
    const checkUser = await requireUser(email);
    if (checkUser === 'BANNED') return res.status(403).json({ error: banMsg });
    if (maintBlock && !(checkUser && checkUser.is_dev === true)) return res.status(503).json({ error: maintBlock, reason: 'maintenance' });

    // Mode "file de révision" : les cartes à réviser maintenant
    if (req.query.due === '1') {
      const nowIso = new Date().toISOString();
      let url = SUPABASE_URL + '/rest/v1/flashcards?user_email=eq.' + encodeURIComponent(email)
        + '&due_date=lte.' + encodeURIComponent(nowIso)
        + '&select=id,question,answer,fiche_id,stability&order=due_date.asc&limit=100';
      if (req.query.fiche_id) url += '&fiche_id=eq.' + encodeURIComponent(req.query.fiche_id);
      try {
        const r = await fetch(url, { headers: sb });
        const cards = await r.json();
        return res.status(200).json(Array.isArray(cards) ? cards : []);
      } catch (e) {
        console.error('Erreur file de révision:', e);
        return res.status(200).json([]);
      }
    }

    // Mode "tableau de bord" : les fiches + nb de cartes + nb à réviser
    try {
      const [fr, cr] = await Promise.all([
        fetch(SUPABASE_URL + '/rest/v1/fiches?user_email=eq.' + encodeURIComponent(email) + '&select=id,titre,created_at&order=created_at.desc', { headers: sb }),
        fetch(SUPABASE_URL + '/rest/v1/flashcards?user_email=eq.' + encodeURIComponent(email) + '&select=fiche_id,due_date,last_review', { headers: sb })
      ]);
      const fiches = await fr.json();
      const cards = await cr.json();
      const now = Date.now();

      const byFiche = {};
      let totalDue = 0, totalCards = 0, reviewedToday = 0;
      // Cartes déjà révisées aujourd'hui (heure de Paris) : sert à l'objectif quotidien du Mode Révision.
      const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(d));
      const today = day(Date.now());
      (Array.isArray(cards) ? cards : []).forEach(c => {
        const key = c.fiche_id || 'none';
        if (!byFiche[key]) byFiche[key] = { total: 0, due: 0 };
        byFiche[key].total += 1;
        totalCards += 1;
        if (new Date(c.due_date).getTime() <= now) { byFiche[key].due += 1; totalDue += 1; }
        if (c.last_review && day(c.last_review) === today) reviewedToday += 1;
      });

      const decks = (Array.isArray(fiches) ? fiches : []).map(f => ({
        fiche_id: f.id,
        titre: f.titre || 'Sans titre',
        total_cards: byFiche[f.id] ? byFiche[f.id].total : 0,
        due_cards: byFiche[f.id] ? byFiche[f.id].due : 0
      }));

      return res.status(200).json({ decks: decks, total_due: totalDue, total_cards: totalCards, reviewed_today: reviewedToday });
    } catch (e) {
      console.error('Erreur tableau de bord révision:', e);
      return res.status(200).json({ decks: [], total_due: 0, total_cards: 0 });
    }
  }

  // ─────────────── ÉCRITURE (POST) ───────────────
  if (req.method === 'POST') {
    const body = req.body || {};
    const email = verifiedEmail;
    const user = await requireUser(email);
    if (user === 'BANNED') return res.status(403).json({ error: banMsg });
    if (!user) return res.status(403).json({ error: 'Compte introuvable. Reconnecte-toi.' });
    if (maintBlock && !(user && user.is_dev === true)) return res.status(503).json({ error: maintBlock, reason: 'maintenance' });

    // ── Noter une carte après révision ──
    if (body.action === 'review') {
      const cardId = String(body.card_id || '');
      const quality = Number(body.quality);
      // Note entière : 1 (Oubli) à 4 (Facile) ; 5 reste accepté pour les anciennes versions de la page.
      if (!UUID_RE.test(cardId) || ![1, 2, 3, 4, 5].includes(quality)) return res.status(400).json({ error: 'Paramètres manquants' });
      try {
        // stability et last_review sont indispensables au calcul FSRS : sans eux, chaque révision repartait de zéro.
        const r = await fetch(SUPABASE_URL + '/rest/v1/flashcards?id=eq.' + encodeURIComponent(cardId) + '&user_email=eq.' + encodeURIComponent(email) + '&select=interval_days,ease,repetitions,stability,last_review', { headers: sb });
        const rows = await r.json();
        const card = Array.isArray(rows) ? rows[0] : null;
        if (!card) return res.status(404).json({ error: 'Carte introuvable' });

        const next = schedule(card, quality);
        // Double filtre (identifiant + propriétaire) : une carte ne peut être modifiée que par son propriétaire.
        const up = await fetch(SUPABASE_URL + '/rest/v1/flashcards?id=eq.' + encodeURIComponent(cardId) + '&user_email=eq.' + encodeURIComponent(email), {
          method: 'PATCH',
          headers: { ...sb, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify(next)
        });
        if (!up.ok) {
          console.error('Mise à jour de carte échouée:', up.status, await up.text());
          return res.status(500).json({ error: 'Erreur lors de l\'enregistrement' });
        }
        return res.status(200).json({ ok: true });
      } catch (e) {
        console.error('Erreur review:', e);
        return res.status(500).json({ error: 'Erreur lors de l\'enregistrement' });
      }
    }

    // ── Générer les flashcards d'une fiche (via l'IA) ──
    if (body.action === 'generate') {
      const ficheId = String(body.fiche_id || '');
      if (!UUID_RE.test(ficheId)) return res.status(400).json({ error: 'Fiche manquante' });

      // 1) La fiche doit exister, appartenir à l'utilisateur et ne pas déjà avoir de cartes.
      //    On le vérifie AVANT de décompter le quota : une demande refusée ne coûte rien.
      let fiche = null;
      try {
        const existR = await fetch(SUPABASE_URL + '/rest/v1/flashcards?fiche_id=eq.' + encodeURIComponent(ficheId) + '&user_email=eq.' + encodeURIComponent(email) + '&select=id', { headers: sb });
        const exist = await existR.json();
        if (Array.isArray(exist) && exist.length > 0) {
          return res.status(200).json({ already: true, count: exist.length });
        }
        const fr = await fetch(SUPABASE_URL + '/rest/v1/fiches?id=eq.' + encodeURIComponent(ficheId) + '&user_email=eq.' + encodeURIComponent(email) + '&select=titre,contenu', { headers: sb });
        const frows = await fr.json();
        fiche = Array.isArray(frows) ? frows[0] : null;
      } catch (e) {
        console.error('Erreur lecture fiche:', e);
        return res.status(503).json({ error: 'Service momentanément indisponible' });
      }
      if (!fiche) return res.status(404).json({ error: 'Fiche introuvable' });

      // 2) Vérification et décompte du quota (le Mode Révision est réservé aux plans Pro/Ultimate,
      //    et limité même en Ultimate pour éviter un usage abusif coûteux)
      let debit = null; // 1 crédit par paquet de cartes de révision
      // Budget en euros : 1 crédit couvre au plus 0,039 € (fiche de 6 000 caractères + consignes, réponse de 3 000 tokens : ~0,034 €).
      let reservedEur = EUR_PER_CREDIT;
      try {
        const quotaRes = await fetch(
          SUPABASE_URL + '/rest/v1/rpc/consume_credits',
          { method: 'POST', headers: Object.assign({}, sb, { 'Content-Type': 'application/json' }), body: JSON.stringify({ p_email: email, p_cost: 1, p_kind: 'flashcard', p_offert: false, p_reserve_eur: reservedEur }) }
        );
        const quota = await quotaRes.json();
        if (!quota || !quota.allowed) {
          reservedEur = 0; // rien n'a été réservé
          if (quota && quota.reason === 'plan_required') {
            return res.status(403).json({ error: 'Le Mode Révision est disponible à partir du forfait Pro.' });
          }
          if (quota && quota.reason === 'daily_limit_reached') {
            return res.status(403).json({ error: 'Tu as atteint la limite de crédits pour aujourd\'hui. Reviens demain, ou passe à un forfait supérieur !' });
          }
          if (quota && quota.reason === 'budget_atteint') {
            return res.status(403).json({ error: BUDGET_MESSAGE, budget: true });
          }
          return res.status(403).json({ error: 'Tu n\'as plus de crédits ce mois-ci (1 crédit par paquet de cartes).' });
        }
        debit = quota;
      } catch (e) {
        reservedEur = 0;
        console.error('Erreur vérification crédits flashcards:', e);
        return res.status(503).json({ error: 'Service momentanément indisponible' });
      }

      // En cas d'échec après le décompte, on rend la carte de quota à l'utilisateur.
      const refundFlashcard = async () => {
        await releaseReserve(SERVICE_KEY, email, reservedEur); reservedEur = 0;
        try {
          if (!debit) return;
          await fetch(SUPABASE_URL + '/rest/v1/rpc/refund_credits', {
            method: 'POST', headers: { ...sb, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_email: email, p_from_month: debit.from_month || 0, p_from_bonus: debit.from_bonus || 0, p_offert: false })
          });
          debit = null;
        } catch (e) { console.error('Remboursement flashcards:', e && e.message); }
      };

      try {
        // Niveau scolaire de l'utilisateur, pour adapter le vocabulaire des flashcards
        const niveauMap = {
          college: "L'utilisateur est au COLLÈGE (11-15 ans). Utilise un vocabulaire simple et accessible, des phrases courtes, et des exemples concrets du quotidien.",
          lycee: "L'utilisateur est au LYCÉE (15-18 ans), il prépare le baccalauréat. Utilise le vocabulaire attendu au bac.",
          prepa: "L'utilisateur est en CLASSE PRÉPARATOIRE. Niveau d'exigence élevé, vocabulaire technique précis, ne simplifie pas.",
          superieur: "L'utilisateur est dans l'ENSEIGNEMENT SUPÉRIEUR. Utilise un vocabulaire académique précis."
        };
        let niveauInstruction = niveauMap.lycee;
        try {
          const nr = await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email) + '&select=niveau_scolaire', { headers: sb });
          const nu = await nr.json();
          if (Array.isArray(nu) && nu[0] && niveauMap[nu[0].niveau_scolaire]) {
            niveauInstruction = niveauMap[nu[0].niveau_scolaire];
          }
        } catch (e) { console.error('Erreur lecture niveau:', e); }

        // On demande à l'IA d'extraire des flashcards (même modèle et même gestion de la réflexion que generate.js)
        const payload = {
          model: FLASH_MODEL,
          max_tokens: 3000,
          system: 'Tu es un expert en pédagogie et en mémorisation active. Tu crées des flashcards de révision de qualité. ' + niveauInstruction,
          messages: [{
            role: 'user',
            content: 'Voici une fiche de révision intitulée "' + (fiche.titre || 'Fiche') + '" :\n\n' + String(fiche.contenu).substring(0, 6000) + '\n\n---\nCrée 8 à 10 flashcards question/réponse à partir de cette fiche.\nRègles :\n- Question courte et précise (le recto).\n- Réponse concise, 1 à 2 phrases maximum (le verso).\n- Couvre les points les plus importants.\nRéponds UNIQUEMENT avec un tableau JSON valide, sans aucun texte autour ni balise Markdown. Format exact :\n[{"question":"...","answer":"..."}]'
          }]
        };
        const applyThinking = () => { const o = THINKING_OPTIONS[thinkingOpt]; if (o) payload.thinking = o; else delete payload.thinking; };
        const send = async () => {
          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify(payload)
          });
          return aiRes.json();
        };
        applyThinking();
        let aiData = await send();
        // Si l'API refuse le réglage de réflexion, on passe au suivant (désactivée → limitée → par défaut).
        while (aiData && aiData.error && payload.thinking && /thinking|budget/i.test(String(aiData.error.message || '')) && thinkingOpt < THINKING_OPTIONS.length - 1) {
          console.error('Réglage de réflexion refusé (flashcards) :', JSON.stringify(payload.thinking), aiData.error.message);
          thinkingOpt++;
          applyThinking();
          aiData = await send();
        }
        if (!aiData || aiData.error) throw new Error((aiData && aiData.error && aiData.error.message) || 'Réponse IA vide');
        if (aiData.usage) await logApiUsage(SERVICE_KEY, email, 'flashcards', FLASH_MODEL, aiData.usage.input_tokens, aiData.usage.output_tokens, 1);

        // On assemble les blocs de texte : le premier bloc peut être une « réflexion » sans texte.
        let text = (Array.isArray(aiData.content) ? aiData.content : []).filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('').trim();
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const a = text.indexOf('['), z = text.lastIndexOf(']');
        if (a !== -1 && z > a) text = text.slice(a, z + 1);
        let cards;
        try { cards = JSON.parse(text); } catch (e) { throw new Error('Réponse IA illisible'); }
        if (!Array.isArray(cards) || cards.length === 0) throw new Error('Aucune carte générée');

        const rows = cards
          .filter(c => c && c.question && c.answer)
          .slice(0, 12)
          .map(c => ({
            user_email: email,
            fiche_id: ficheId,
            question: String(c.question).substring(0, 500),
            answer: String(c.answer).substring(0, 1000)
          }));

        if (rows.length === 0) throw new Error('Aucune carte valide');

        const ins = await fetch(SUPABASE_URL + '/rest/v1/flashcards', {
          method: 'POST',
          headers: { ...sb, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify(rows)
        });
        if (!ins.ok) { console.error('Insert cartes échoué:', ins.status, await ins.text()); throw new Error('Enregistrement échoué'); }

        await releaseReserve(SERVICE_KEY, email, reservedEur); reservedEur = 0;
        return res.status(200).json({ created: rows.length });
      } catch (e) {
        console.error('Erreur génération flashcards:', e);
        await logApiUsage(SERVICE_KEY, email, 'erreur:flashcards:' + String((e && e.message) || e).slice(0, 120), FLASH_MODEL, 0, 0);
        await refundFlashcard();
        return res.status(500).json({ error: 'La création des cartes a échoué. Réessaie dans un instant : ton crédit t\'a été rendu.' });
      }
    }

    return res.status(400).json({ error: 'Action inconnue' });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
