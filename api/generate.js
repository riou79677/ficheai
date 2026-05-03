import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { course, format, language, email } = req.body;

  if (!course || !format) {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }

  // Connexion Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // Vérifier l'utilisateur et ses générations
  if (email) {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (user && user.generations_used >= user.generations_limit) {
      return res.status(403).json({ 
        error: 'Limite de générations atteinte. Passe à Pro pour continuer !' 
      });
    }

    // Incrémenter le compteur
    if (user) {
      await supabase
        .from('users')
        .update({ 
          generations_used: user.generations_used + 1,
          updated_at: new Date().toISOString()
        })
        .eq('email', email);
    }
  }

  const prompts = {
    fiche: `Tu es un expert en pédagogie. À partir du cours ci-dessous, génère une FICHE DE RÉVISION complète, structurée et détaillée.

Format OBLIGATOIRE :

📚 TITRE DU SUJET

🎯 POINTS CLÉS
(8-10 points essentiels, chacun avec un titre en gras suivi d'une explication claire de 2-3 lignes)

📖 DÉFINITIONS IMPORTANTES
(Tous les termes clés du cours avec leur définition précise et un exemple si possible)

⚡ À RETENIR ABSOLUMENT
(5-7 points critiques à ne jamais oublier, formulés de façon mémorable)

🔗 LIENS & CONNEXIONS
(Comment ce chapitre s'articule avec d'autres notions du cours)

❓ QUESTIONS PROBABLES À L'EXAMEN
(3-5 questions typiques avec une courte réponse)

Sois exhaustif, précis et pédagogique. Utilise des exemples concrets.`,

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
- [Point 2]`
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
        max_tokens: 1500,
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
