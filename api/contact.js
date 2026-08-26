const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Configuration serveur incomplète' });

  const { email, subject, message } = req.body || {};

  if (!email || !subject || !message) {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }

  // Validation basique
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }
  if (message.length > 5000) {
    return res.status(400).json({ error: 'Message trop long (5000 caractères max)' });
  }

  try {
    const insertRes = await fetch(SUPABASE_URL + '/rest/v1/contact_messages', {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ email, subject, message })
    });

    if (!insertRes.ok) {
      const err = await insertRes.text();
      console.error('Erreur Supabase:', err);
      return res.status(500).json({ error: 'Erreur lors de l\'enregistrement' });
    }

    return res.status(200).json({ success: true });

  } catch (e) {
    console.error('Erreur contact:', e);
    return res.status(500).json({ error: 'Service momentanément indisponible' });
  }
}
