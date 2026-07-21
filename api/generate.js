const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';

export default async function handler(req, res) {
  // Pas de CORS ouvert au monde entier : l'app appelle cet endpoint en same-origin,
  // qui n'a pas besoin d'en-tête CORS. On bloque ainsi l'abus depuis d'autres sites.
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    console.error('generate.js : SUPABASE_SERVICE_ROLE_KEY manquante.');
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  const { course, format, language, email } = req.body || {};

  if (!course || !format) {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }

  // ── SÉCURITÉ : la génération consomme des crédits Claude → réservée aux comptes ──
  if (!email) {
    return res.status(401).json({ error: 'Connecte-toi pour générer une fiche (5 gratuites à l\'inscription).' });
  }

  // Récupération du niveau scolaire (info seule, pas de quota) + vérification/décompte via la fonction unifiée
  let user;
  try {
    const userRes = await fetch(
      SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email) + '&select=plan,niveau_scolaire',
      { headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY } }
    );
    const users = await userRes.json();
    user = Array.isArray(users) ? users[0] : null;
  } catch (e) {
    console.error('Erreur lecture profil:', e);
    return res.status(503).json({ error: 'Service momentanément indisponible' });
  }

  if (!user) {
    return res.status(403).json({ error: 'Compte introuvable. Déconnecte-toi puis reconnecte-toi.' });
  }

  // Le format "Sujet d'examen" est réservé aux plans payants (fonctionnalité premium)
  if (format === 'examen' && user.plan === 'starter') {
    return res.status(403).json({ error: 'Le générateur de sujets d\'examen est disponible à partir du plan Pro. Passe à Pro pour t\'entraîner avec des sujets sur mesure !' });
  }

  try {
    const quotaRes = await fetch(
      SUPABASE_URL + '/rest/v1/rpc/check_and_consume_quota',
      { method: 'POST', headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_email: email, p_type: 'generation' }) }
    );
    const quota = await quotaRes.json();
    if (!quota.allowed) {
      if (quota.reason === 'daily_limit_reached') {
        return res.status(403).json({ error: 'Tu as atteint la limite de générations pour aujourd\'hui. Reviens demain, ou passe à un plan supérieur !' });
      }
      return res.status(403).json({ error: 'Limite de générations atteinte pour ce mois. Passe à un plan supérieur pour continuer !' });
    }
  } catch (e) {
    console.error('Erreur vérification quota:', e);
    return res.status(503).json({ error: 'Service momentanément indisponible' });
  }

  const charLimit = user.plan === 'ultimate' ? 60000 : user.plan === 'pro' ? 80000 : 30000;

  const prompts = {
    fiche: `Tu es un expert en pédagogie universitaire. À partir du cours ci-dessous, génère une FICHE DE RÉVISION complète et ultra-structurée, comme si tu aidais un étudiant à préparer un examen important.

Format OBLIGATOIRE — respecte exactement cette structure :

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 [TITRE DU SUJET EN MAJUSCULES]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 POINTS CLÉS À MAÎTRISER
▸ [Point 1 — titre en gras] : explication claire et précise en 2-3 lignes
▸ [Point 2 — titre en gras] : explication claire et précise en 2-3 lignes
▸ [Point 3 — titre en gras] : explication claire et précise en 2-3 lignes
(continue pour 8-10 points au total)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📖 DÉFINITIONS ESSENTIELLES
- [Terme 1] → définition précise et concise
- [Terme 2] → définition précise et concise
- [Terme 3] → définition précise et concise
(tous les termes importants du cours)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ À RETENIR ABSOLUMENT (pour l'examen)
✦ [Point critique 1]
✦ [Point critique 2]
✦ [Point critique 3]
✦ [Point critique 4]
✦ [Point critique 5]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❓ QUESTIONS PROBABLES À L'EXAMEN
Q1 : [question] → [réponse courte]
Q2 : [question] → [réponse courte]
Q3 : [question] → [réponse courte]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔗 LIENS AVEC D'AUTRES NOTIONS
→ [Connexion 1]
→ [Connexion 2]

Sois exhaustif, précis et utilise des exemples concrets. La fiche doit être directement utilisable pour réviser un examen.`,

    quiz: `Tu es un professeur expert. Génère un QUIZ de 6 questions variées à partir du cours.

Format OBLIGATOIRE pour chaque question :
❓ Question N : [question claire et précise]
   A) [proposition]
   B) [proposition]
   C) [proposition]
   D) [proposition]
✅ Réponse : [lettre] — [explication détaillée]
💡 Astuce : [moyen de retenir la bonne réponse]

Niveaux : 2 faciles, 2 moyennes, 2 difficiles.`,

    flash: `Tu es un expert en mémorisation. Génère 10 FLASHCARDS complètes à partir du cours.

Format OBLIGATOIRE :
🃏 CARTE [N]
RECTO : [question courte et précise]
VERSO : [réponse complète en 2-3 lignes maximum]
💡 Astuce mémo : [moyen mnémotechnique concret]
---

Va du plus simple au plus complexe.`,

    mindmap: `Tu es un expert en organisation des connaissances. Génère un MIND MAP textuel complet.

Format OBLIGATOIRE :
🧠 [CONCEPT CENTRAL EN MAJUSCULES]
│
├── 🔵 BRANCHE 1 : [Thème majeur]
│   ├── → [Sous-concept avec explication courte]
│   ├── → [Sous-concept avec explication courte]
│   └── → [Sous-concept avec explication courte]
│
├── 🟣 BRANCHE 2 : [Thème majeur]
│   ├── → [Sous-concept]
│   └── → [Sous-concept]
│
├── 🟡 BRANCHE 3 : [Thème majeur]
│   └── → [Sous-concept]
│
└── 🔴 BRANCHE 4 : [Thème majeur]
    └── → [Sous-concept]`,

    questions: `Tu es un professeur bienveillant. Génère 6 QUESTIONS OUVERTES de révision.

Format OBLIGATOIRE :
💬 QUESTION [N] — [Niveau : Basique / Intermédiaire / Avancé]
[Question complète et précise]

📝 ÉLÉMENTS DE RÉPONSE ATTENDUS :
- [Point clé 1]
- [Point clé 2]
- [Point clé 3]

⏱ Temps estimé : [X minutes]
💎 Conseil : [comment aborder cette question]
---

2 basiques, 2 intermédiaires, 2 avancées.`,

    chrono: `Tu es un expert en organisation. Génère une CHRONOLOGIE ou PLAN STRUCTURÉ détaillé.

Format OBLIGATOIRE :
📅 [TITRE DU SUJET]

🕐 [DATE/ÉTAPE 1] ━━━ [Événement ou concept]
   └ [Explication de l'importance — 2 lignes]

🕑 [DATE/ÉTAPE 2] ━━━ [Événement ou concept]
   └ [Explication]

📊 RÉSUMÉ DES GRANDES PÉRIODES :
- [Période/Phase 1] : [résumé]
- [Période/Phase 2] : [résumé]

⚡ POINTS CLÉS À RETENIR :
- [Point 1]
- [Point 2]`,

    examen: `Tu es un professeur qui conçoit des sujets d'examen originaux, dans le style des épreuves officielles françaises correspondant précisément au niveau de l'élève (précisé plus bas dans ces instructions) :
- Collège → dans le style du BREVET (DNB)
- Lycée → dans le style du BACCALAURÉAT
- Classe préparatoire → dans le style d'un DEVOIR SURVEILLÉ / KHÔLLE de prépa, ou d'un CONCOURS (Mines, X, Centrale selon la matière)
- Supérieur (université/école) → dans le style d'un EXAMEN PARTIEL ou d'un DEVOIR de fin de semestre

RÈGLE ABSOLUE, NON NÉGOCIABLE : tu dois créer un sujet 100% ORIGINAL et INÉDIT. Tu peux t'inspirer du STYLE, du FORMAT, du NIVEAU DE DIFFICULTÉ et du TYPE DE QUESTIONS des épreuves officielles que tu connais pour ce niveau, mais tu ne dois JAMAIS reproduire, recopier ou paraphraser de près un énoncé, un exercice ou une question qui existe réellement (annales de bac, brevet, sujets labolycee.org, APMEP, concours, ou autre). Invente des contextes, des données chiffrées, des scénarios et des formulations entièrement nouveaux. Si tu ne peux pas garantir l'originalité totale d'un exercice, remplace-le par un exercice différent que tu es sûr d'avoir inventé.

Format OBLIGATOIRE, à adapter selon la matière du cours fourni :

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 [NOM DE L'ÉPREUVE ADAPTÉ AU NIVEAU : ex "BREVET BLANC", "BAC BLANC", "DEVOIR SURVEILLÉ", "EXAMEN PARTIEL"] — [MATIÈRE]
Durée conseillée : [X]h · Total : 20 points
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXERCICE 1 ([X] points) — [Titre évocateur du contexte, inventé]
[Énoncé avec contexte concret ou théorique, inventé, cohérent avec le cours]
a) [Sous-question]
b) [Sous-question]
c) [Sous-question]

EXERCICE 2 ([X] points) — [Titre évocateur, inventé]
[Énoncé]
a) [Sous-question]
b) [Sous-question]

EXERCICE 3 ([X] points) — [Titre évocateur, inventé]
[Énoncé]
a) [Sous-question]
b) [Sous-question]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ CORRIGÉ DÉTAILLÉ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXERCICE 1 :
a) [Réponse détaillée avec méthode]
b) [Réponse détaillée avec méthode]
c) [Réponse détaillée avec méthode]

EXERCICE 2 :
a) [Réponse détaillée]
b) [Réponse détaillée]

EXERCICE 3 :
a) [Réponse détaillée]
b) [Réponse détaillée]

Les points doivent couvrir uniquement les notions présentes dans le cours fourni. Adapte la difficulté et le vocabulaire au niveau scolaire précisé plus bas.`
  };

  if (!prompts[format]) {
    return res.status(400).json({ error: 'Format inconnu' });
  }

  const langMap = { fr: 'français', en: 'English', es: 'Español', de: 'Deutsch' };
  const langInstruction = language === 'auto'
    ? 'Réponds dans la même langue que le cours fourni.'
    : 'Réponds obligatoirement en ' + (langMap[language] || 'français') + '.';

  // Adaptation au niveau scolaire de l'utilisateur
  const niveauMap = {
    college: "L'utilisateur est au COLLÈGE (11-15 ans). Utilise un vocabulaire simple et accessible, des phrases courtes, et beaucoup d'exemples concrets du quotidien. Explique chaque terme technique. Évite les formulations abstraites.",
    lycee: "L'utilisateur est au LYCÉE (15-18 ans), il prépare le baccalauréat. Utilise le vocabulaire attendu au bac, structure comme un cours de lycée, et anticipe les questions type bac. Reste rigoureux sans être universitaire.",
    prepa: "L'utilisateur est en CLASSE PRÉPARATOIRE. Attends-toi à un très haut niveau d'exigence : rigueur formelle, démonstrations complètes, vocabulaire technique précis, et mise en perspective des concepts. Ne simplifie pas.",
    superieur: "L'utilisateur est dans l'ENSEIGNEMENT SUPÉRIEUR (université, école). Utilise un vocabulaire académique précis, structure les concepts de façon universitaire, et n'hésite pas à mentionner les débats ou nuances disciplinaires."
  };
  const niveauInstruction = niveauMap[user.niveau_scolaire] || niveauMap.lycee;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        system: 'Tu es FicheAI, un assistant pédagogique expert. ' + langInstruction + ' ' + niveauInstruction + ' Sois précis, structuré et pédagogique.',
        messages: [{
          role: 'user',
          content: prompts[format] + '\n\n---\nCOURS :\n' + String(course).substring(0, charLimit) + '\n---\n\nGénère maintenant le contenu demandé.'
        }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    // Incrément du quota APRÈS génération réussie (l'utilisateur ne perd rien en cas d'échec).
    fetch(
      SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email),
      {
        method: 'PATCH',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': 'Bearer ' + SERVICE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ generations_used: user.generations_used + 1 })
      }
    ).catch(e => console.error('Échec incrément quota:', e));

    return res.status(200).json({ result: data.content[0].text });

  } catch (error) {
    console.error('Erreur API:', error);
    return res.status(500).json({ error: error.message });
  }
}
