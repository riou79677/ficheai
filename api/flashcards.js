const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';

// ── Algorithme de répétition espacée (SM-2 simplifié, façon Anki) ──
// quality : 1 = À revoir, 3 = Difficile, 4 = Bien, 5 = Facile
function schedule(card, quality) {
  let interval = card.interval_days || 0;
  let ease = card.ease || 2.5;
  let reps = card.repetitions || 0;

  if (quality < 3) {
    // À revoir : on recommence, la carte revient tout de suite
    reps = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ease);
    reps += 1;
    ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (ease < 1.3) ease = 1.3;
  }

  const due = new Date();
  if (interval > 0) due.setDate(due.getDate() + interval);
  return { interval_days: interval, ease: ease, repetitions: reps, due_date: due.toISOString() };
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

  // Vérifie qu'un compte existe pour cet email
  async function requireUser(email) {
    if (!email) return null;
    const r = await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email) + '&select=email', { headers: sb });
    const u = await r.json();
    return (Array.isArray(u) && u[0]) ? u[0] : null;
  }

  // ─────────────── LECTURE (GET) ───────────────
  if (req.method === 'GET') {
    const email = req.query.email;
    if (!email) return res.status(401).json({ error: 'Non connecté' });

    // Mode "file de révision" : les cartes à réviser maintenant
    if (req.query.due === '1') {
      const nowIso = new Date().toISOString();
      let url = SUPABASE_URL + '/rest/v1/flashcards?user_email=eq.' + encodeURIComponent(email)
        + '&due_date=lte.' + encodeURIComponent(nowIso)
        + '&select=id,question,answer,fiche_id&order=due_date.asc&limit=100';
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
        fetch(SUPABASE_URL + '/rest/v1/flashcards?user_email=eq.' + encodeURIComponent(email) + '&select=fiche_id,due_date', { headers: sb })
      ]);
      const fiches = await fr.json();
      const cards = await cr.json();
      const now = Date.now();

      const byFiche = {};
      let totalDue = 0, totalCards = 0;
      (Array.isArray(cards) ? cards : []).forEach(c => {
        const key = c.fiche_id || 'none';
        if (!byFiche[key]) byFiche[key] = { total: 0, due: 0 };
        byFiche[key].total += 1;
        totalCards += 1;
        if (new Date(c.due_date).getTime() <= now) { byFiche[key].due += 1; totalDue += 1; }
      });

      const decks = (Array.isArray(fiches) ? fiches : []).map(f => ({
        fiche_id: f.id,
        titre: f.titre || 'Sans titre',
        total_cards: byFiche[f.id] ? byFiche[f.id].total : 0,
        due_cards: byFiche[f.id] ? byFiche[f.id].due : 0
      }));

      return res.status(200).json({ decks: decks, total_due: totalDue, total_cards: totalCards });
    } catch (e) {
      console.error('Erreur tableau de bord révision:', e);
      return res.status(200).json({ decks: [], total_due: 0, total_cards: 0 });
    }
  }

  // ─────────────── ÉCRITURE (POST) ───────────────
  if (req.method === 'POST') {
    const body = req.body || {};
    const email = body.email;
    const user = await requireUser(email);
    if (!user) return res.status(403).json({ error: 'Compte introuvable. Reconnecte-toi.' });

    // ── Noter une carte après révision ──
    if (body.action === 'review') {
      const cardId = body.card_id;
      const quality = Number(body.quality);
      if (!cardId || !quality) return res.status(400).json({ error: 'Paramètres manquants' });
      try {
        const r = await fetch(SUPABASE_URL + '/rest/v1/flashcards?id=eq.' + encodeURIComponent(cardId) + '&user_email=eq.' + encodeURIComponent(email) + '&select=interval_days,ease,repetitions', { headers: sb });
        const rows = await r.json();
        const card = Array.isArray(rows) ? rows[0] : null;
        if (!card) return res.status(404).json({ error: 'Carte introuvable' });

        const next = schedule(card, quality);
        await fetch(SUPABASE_URL + '/rest/v1/flashcards?id=eq.' + encodeURIComponent(cardId), {
          method: 'PATCH',
          headers: { ...sb, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify(next)
        });
        return res.status(200).json({ ok: true });
      } catch (e) {
        console.error('Erreur review:', e);
        return res.status(500).json({ error: 'Erreur lors de l\'enregistrement' });
      }
    }

    // ── Générer les flashcards d'une fiche (via l'IA) ──
    if (body.action === 'generate') {
      const ficheId = body.fiche_id;
      if (!ficheId) return res.status(400).json({ error: 'Fiche manquante' });

      // Vérification et décompte du quota (le Mode Révision est réservé aux plans Pro/Ultimate,
      // et limité même en Ultimate pour éviter un usage abusif coûteux)
      try {
        const quotaRes = await fetch(
          SUPABASE_URL + '/rest/v1/rpc/check_and_consume_quota',
          { method: 'POST', headers: Object.assign({}, sb, { 'Content-Type': 'application/json' }), body: JSON.stringify({ p_email: email, p_type: 'flashcard' }) }
        );
        const quota = await quotaRes.json();
        if (!quota.allowed) {
          if (quota.reason === 'plan_required') {
            return res.status(403).json({ error: 'Le Mode Révision est disponible à partir du plan Pro.' });
          }
          return res.status(403).json({ error: 'Limite de cartes générées atteinte pour ce mois. Passe à un plan supérieur pour continuer !' });
        }
      } catch (e) {
        console.error('Erreur vérification quota flashcards:', e);
        return res.status(503).json({ error: 'Service momentanément indisponible' });
      }

      try {
        // On refuse de recréer des cartes si la fiche en a déjà
        const existR = await fetch(SUPABASE_URL + '/rest/v1/flashcards?fiche_id=eq.' + encodeURIComponent(ficheId) + '&user_email=eq.' + encodeURIComponent(email) + '&select=id', { headers: sb });
        const exist = await existR.json();
        if (Array.isArray(exist) && exist.length > 0) {
          return res.status(200).json({ already: true, count: exist.length });
        }

        // On récupère le contenu de la fiche (et on vérifie qu'elle appartient bien à l'utilisateur)
        const fr = await fetch(SUPABASE_URL + '/rest/v1/fiches?id=eq.' + encodeURIComponent(ficheId) + '&user_email=eq.' + encodeURIComponent(email) + '&select=titre,contenu', { headers: sb });
        const frows = await fr.json();
        const fiche = Array.isArray(frows) ? frows[0] : null;
        if (!fiche) return res.status(404).json({ error: 'Fiche introuvable' });

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

        // On demande à Claude d'extraire des flashcards
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 1500,
            system: 'Tu es un expert en pédagogie et en mémorisation active. Tu crées des flashcards de révision de qualité. ' + niveauInstruction,
            messages: [{
              role: 'user',
              content: 'Voici une fiche de révision intitulée "' + (fiche.titre || 'Fiche') + '" :\n\n' + String(fiche.contenu).substring(0, 6000) + '\n\n---\nCrée 8 à 10 flashcards question/réponse à partir de cette fiche.\nRègles :\n- Question courte et précise (le recto).\n- Réponse concise, 1 à 2 phrases maximum (le verso).\n- Couvre les points les plus importants.\nRéponds UNIQUEMENT avec un tableau JSON valide, sans aucun texte autour ni balise Markdown. Format exact :\n[{"question":"...","answer":"..."}]'
            }]
          })
        });
        const aiData = await aiRes.json();
        if (aiData.error) throw new Error(aiData.error.message);

        let text = aiData.content[0].text.trim();
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
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

        return res.status(200).json({ created: rows.length });
      } catch (e) {
        console.error('Erreur génération flashcards:', e);
        return res.status(500).json({ error: e.message || 'Erreur de génération' });
      }
    }

    return res.status(400).json({ error: 'Action inconnue' });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
