const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';

export default async function handler(req, res) {
  // Same-origin uniquement : pas de CORS ouvert au monde entier.
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    console.error('chat.js : SUPABASE_SERVICE_ROLE_KEY manquante.');
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  const { messages, courseContent, email, language } = req.body || {};

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }

  // ── SÉCURITÉ : le Chat IA est un produit payant → compte requis + plan vérifié serveur ──
  if (!email) {
    return res.status(401).json({ error: 'Connecte-toi pour utiliser le Chat IA.' });
  }

  // Vérification + décompte du quota chat (Pro : 20/mois, Ultimate : illimité) — atomique et non contournable
  try {
    const quotaRes = await fetch(
      SUPABASE_URL + '/rest/v1/rpc/consume_chat_message',
      {
        method: 'POST',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_email: email })
      }
    );
    const quota = await quotaRes.json();

    if (!quota.allowed) {
      if (quota.reason === 'user_not_found') {
        return res.status(403).json({ error: 'Compte introuvable. Déconnecte-toi puis reconnecte-toi.' });
      }
      if (quota.reason === 'plan_required') {
        return res.status(403).json({ error: 'Le Chat IA est disponible à partir du plan Pro.' });
      }
      return res.status(403).json({ error: 'Limite de 20 messages atteinte ce mois. Passe à Ultimate pour un chat illimité !' });
    }
  } catch (e) {
    console.error('Erreur vérification quota chat:', e);
    return res.status(503).json({ error: 'Service momentanément indisponible' });
  });
  }

  const langMap = { fr: 'français', en: 'English', es: 'Español', de: 'Deutsch' };
  const langInstruction = !language || language === 'auto'
    ? 'Réponds dans la même langue que l\'étudiant.'
    : 'Réponds en ' + (langMap[language] || 'français') + '.';

  const systemPrompt = `Tu es FicheAI, un assistant pédagogique expert et bienveillant. Tu aides les étudiants à réviser leurs cours de façon efficace.
${langInstruction}
${courseContent ? '\n\nVoici le cours de l\'étudiant :\n---\n' + String(courseContent).substring(0, 6000) + '\n---' : ''}

Tu peux générer des fiches de révision, quiz, flashcards, mind maps, expliquer des notions, anticiper les questions d'examen.
Sois toujours clair, structuré, encourageant et pédagogique. Utilise des émojis pour structurer tes réponses.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: systemPrompt,
        messages: messages.slice(-12)
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    return res.status(200).json({ result: data.content[0].text });

  } catch (error) {
    console.error('Erreur API chat:', error);
    return res.status(500).json({ error: error.message });
  }
}
