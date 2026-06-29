export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { messages, courseContent, email, language } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }

  // Vérifier le plan et la limite de messages chat
  if (email) {
    try {
      const userRes = await fetch(
        'https://qyjqtjrqnlbgtxvnjvnk.supabase.co/rest/v1/users?email=eq.' + encodeURIComponent(email) + '&select=plan,chat_messages_used,chat_messages_limit',
        {
          headers: {
            'apikey': 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ',
            'Authorization': 'Bearer sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ'
          }
        }
      );
      const users = await userRes.json();
      const user = users[0];

      if (!user) {
        return res.status(403).json({ error: 'Compte introuvable.' });
      }

      // Bloquer les Starters
      if (!user || user.plan === 'starter') {
        return res.status(403).json({ error: 'Le chat IA est disponible à partir du plan Pro.' });
      }

      // Vérifier limite messages chat
      const chatLimit = user.plan === 'ultimate' ? 999999 : 20;
      const chatUsed = user.chat_messages_used || 0;
      if (chatUsed >= chatLimit) {
        return res.status(403).json({ error: 'Limite de messages chat atteinte ce mois. Passe à Ultimate pour des messages illimités !' });
      }

      // Incrémenter le compteur
      await fetch(
        'https://qyjqtjrqnlbgtxvnjvnk.supabase.co/rest/v1/users?email=eq.' + encodeURIComponent(email),
        {
          method: 'PATCH',
          headers: {
            'apikey': 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ',
            'Authorization': 'Bearer sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ chat_messages_used: chatUsed + 1 })
        }
      );
    } catch(e) {
      console.log('Erreur Supabase chat:', e);
    }
  }

  const langMap = { fr: 'français', en: 'English', es: 'Español', de: 'Deutsch' };
  const langInstruction = !language || language === 'auto'
    ? 'Réponds dans la même langue que l\'étudiant.'
    : 'Réponds en ' + (langMap[language] || 'français') + '.';

  const systemPrompt = `Tu es FicheAI, un assistant pédagogique expert et bienveillant. Tu aides les étudiants à réviser leurs cours de façon efficace.
${langInstruction}
${courseContent ? '\n\nVoici le cours de l\'étudiant sur lequel tu dois travailler :\n---\n' + courseContent.substring(0, 6000) + '\n---' : ''}

Tes capacités :
- Générer des fiches de révision structurées avec émojis
- Créer des quiz, flashcards, mind maps, chronologies
- Expliquer des notions complexes simplement
- Anticiper les questions d'examen probables
- Donner des conseils de mémorisation

Sois toujours clair, structuré, encourageant et pédagogique.`;

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
