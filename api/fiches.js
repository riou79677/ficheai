const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    console.error('fiches.js : SUPABASE_SERVICE_ROLE_KEY manquante.');
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': 'Bearer ' + SERVICE_KEY
  };

  // ── Charger les fiches d'un utilisateur (on ne renvoie que les id : compteur) ──
  if (req.method === 'GET') {
    const email = req.query.email;
    if (!email) return res.status(400).json([]);
    try {
      const r = await fetch(
        SUPABASE_URL + '/rest/v1/fiches?user_email=eq.' + encodeURIComponent(email) + '&select=id',
        { headers }
      );
      const data = await r.json();
      return res.status(200).json(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Erreur lecture fiches:', e);
      return res.status(200).json([]);
    }
  }

  // ── Sauvegarder une fiche ──
  if (req.method === 'POST') {
    const b = req.body || {};
    const email = b.user_email || b.email;
    if (!email || !b.contenu) {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1/fiches', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          user_email: email,
          format: b.format || null,
          format_icon: b.format_icon || null,
          titre: (b.titre || 'Sans titre').substring(0, 120),
          contenu: b.contenu
        })
      });
      if (!r.ok) {
        console.error('Échec insert fiche:', r.status, await r.text());
        return res.status(500).json({ error: 'Échec de la sauvegarde' });
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('Erreur sauvegarde fiche:', e);
      return res.status(500).json({ error: 'Échec de la sauvegarde' });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
