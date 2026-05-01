export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { course, format, language } = req.body;

  if (!course || !format) {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }

  const prompts = {
    fiche: `Tu es un expert en pédagogie. À partir du cours ci-dessous, génère une FICHE DE RÉVISION structurée.

Format OBLIGATOIRE :
📚 TITRE DU SUJET

🎯 POINTS CLÉS (5-8 points essentiels en bullet points avec titres en gras)

📖 DÉFINITIONS IMPORTANTES (termes clés avec définition concise)

⚡ À RETENIR ABSOLUMENT (3-5 points ultra-importants)

🔗 LIENS & CONNEXIONS (connexions avec d'autres notions)`,

    quiz: `Tu es un professeur expert. Génère un QUIZ QCM de 5 questions à partir du cours.

Format OBLIGATOIRE :
❓ Question N : [question]
   A) [proposition]
   B) [proposition]
   C) [proposition]
   D) [proposition]
✅ Réponse : [lettre] — [explication courte]

Varie les niveaux : 2 faciles, 2 moyennes, 1 difficile.`,

    flash: `Tu es un expert en mémorisation. Génère 8 FLASHCARDS à partir du cours.

Format OBLIGATOIRE :
🃏 CARTE [N]
RECTO : [question courte et précise]
VERSO : [réponse concise, max 2-3 lignes]
💡 Astuce mémo : [moyen mnémotechnique]
---`,

    mindmap: `Tu es un expert en visualisation. Génère un MIND MAP textuel structuré.

Format OBLIGATOIRE :
🧠 [CONCEPT CENTRAL]
│
├── 🔵 BRANCHE 1 : [Thème majeur]
│   ├── → [Sous-concept]
│   └── → [Sous-concept]
│
├── 🟣 BRANCHE 2 : [Thème majeur]
│   └── → [Sous-concept]
│
└── 🔴 BRANCHE 3 : [Thème majeur]
    └── → [Sous-concept]`,

    questions: `Tu es un professeur bienveillant. Génère 6 QUESTIONS OUVERTES de révision.

Format OBLIGATOIRE :
💬 QUESTION [N] — [Niveau : Basique/Intermédiaire/Avancé]
[Question complète]

📝 ÉLÉMENTS DE RÉPONSE :
• [Point 1]
• [Point 2]
⏱ Temps estimé : [X min]
---`,

    chrono: `Tu es un expert en organisation. Génère une CHRONOLOGIE détaillée.

Format OBLIGATOIRE :
📅 CHRONOLOGIE — [SUJET]

🕐 [DATE/PÉRIODE] ━━━ [ÉVÉNEMENT]
   └ [Importance de cet événement]

📊 RÉSUMÉ DES GRANDES PÉRIODES :
• [Période] : [résumé]`
  };

  const langMap = { fr: 'français', en: 'English', es: 'Español', de: 'Deutsch' };
  const langInstruction = language === 'auto'
    ? 'Réponds dans la même langue que le cours fourni.'
    : `Réponds obligatoirement en ${langMap[language] || 'français'}.`;

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
        max_tokens: 1200,
        system: `Tu es StudyAI, un assistant pédagogique expert. ${langInstruction} Sois précis, structuré et pédagogique.`,
        messages: [{
          role: 'user',
          content: `${prompts[format]}\n\n---\nCOURS :\n${course}\n---\n\nGénère maintenant le contenu demandé.`
        }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    return res.status(200).json({ result: data.content[0].text });

  } catch (error) {
    console.error('Erreur API:', error);
    return res.status(500).json({ error: error.message });
  }
}
