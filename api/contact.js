import { rateLimit, clientIp } from './_ratelimit.js';
const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Configuration serveur incomplète' });

  const { email, subject, message, website } = req.body || {};

  // Anti-spam : champ piège (invisible pour un humain). Un robot le remplit : on fait semblant de réussir.
  if (website) return res.status(200).json({ success: true });

  if (!email || !subject || !message || typeof email !== 'string' || typeof subject !== 'string' || typeof message !== 'string') {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }
  // Anti-spam par adresse IP (meilleur effort, par instance) : la limite par e-mail se contournait en changeant d'adresse.
  if (rateLimit('contact:ip:' + clientIp(req), 5, 3600 * 1000).limited) {
    return res.status(429).json({ error: 'Trop de messages envoyés. Réessaie dans une heure.' });
  }

  // Validation basique
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }
  if (String(subject).length > 200) {
    return res.status(400).json({ error: 'Objet trop long' });
  }
  if (message.length > 5000) {
    return res.status(400).json({ error: 'Message trop long (5000 caractères max)' });
  }

  try {
    // Anti-spam : 5 messages maximum par heure et par adresse e-mail
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const cnt = await fetch(SUPABASE_URL + '/rest/v1/contact_messages?select=id&email=eq.' + encodeURIComponent(email) + '&created_at=gte.' + encodeURIComponent(since), {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
    });
    if (cnt.ok) {
      const rows = await cnt.json();
      if (Array.isArray(rows) && rows.length >= 5) {
        return res.status(429).json({ error: 'Trop de messages envoyés. Réessaie dans une heure.' });
      }
    }

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
