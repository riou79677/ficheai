const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    console.error('fiches.js : SUPABASE_SERVICE_ROLE_KEY manquante.');
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';
  const headers = { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY };

  // ── Authentification : l'email vient du jeton de connexion, jamais de ce que le navigateur envoie ──
  // (avant, n'importe qui pouvait écrire dans la bibliothèque d'un autre en donnant son email)
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Connecte-toi pour continuer.' });
  let email;
  try {
    const authRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + token }
    });
    if (!authRes.ok) return res.status(401).json({ error: 'Session invalide, reconnecte-toi.' });
    const authData = await authRes.json();
    email = authData.email;
    if (!email) return res.status(401).json({ error: 'Session invalide.' });
  } catch (e) {
    return res.status(503).json({ error: 'Service momentanément indisponible' });
  }

  // ── Compter les fiches de l'utilisateur connecté (on ne renvoie que les id) ──
  if (req.method === 'GET') {
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

  // ── Sauvegarder une fiche pour l'utilisateur connecté ──
  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.contenu) return res.status(400).json({ error: 'Paramètres manquants' });
    if (String(b.contenu).length > 50000) return res.status(400).json({ error: 'Contenu trop volumineux.' });
    try {
      const checkRes = await fetch(
        SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email) + '&select=id',
        { headers }
      );
      const checkData = await checkRes.json();
      if (!Array.isArray(checkData) || checkData.length === 0) {
        return res.status(403).json({ error: 'Compte introuvable.' });
      }
    } catch (e) {
      console.error('Erreur vérification compte:', e);
      return res.status(503).json({ error: 'Service momentanément indisponible' });
    }
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1/fiches', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
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
