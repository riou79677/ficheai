import { rateLimit } from './_ratelimit.js';
import { mfaMissing, MFA_REQUIRED } from './_mfa.js';
const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';

// Formats acceptés et leur icône : l'icône est déduite du format côté serveur, jamais reprise du navigateur.
const FORMAT_ICONS = { fiche: '📄', quiz: '✅', flash: '🃏', mindmap: '🧠', questions: '💬', chrono: '📅', examen: '📝' };
// Plafond de la bibliothèque par compte (protège la base contre un remplissage par script).
const MAX_FICHES_PER_USER = 1500;

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
    if (mfaMissing(token, authData)) return res.status(401).json(MFA_REQUIRED);
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
    if (!b.contenu || typeof b.contenu !== 'string') return res.status(400).json({ error: 'Paramètres manquants' });
    if (b.contenu.length > 50000) return res.status(400).json({ error: 'Contenu trop volumineux.' });
    // Anti-rafale (meilleur effort, par instance) : 60 enregistrements par tranche de 10 minutes.
    if (rateLimit('fiches:u:' + email.toLowerCase(), 60, 10 * 60 * 1000).limited) {
      return res.status(429).json({ error: 'Trop d\'enregistrements d\'un coup. Patiente quelques minutes.' });
    }
    const format = Object.prototype.hasOwnProperty.call(FORMAT_ICONS, b.format) ? b.format : 'fiche';
    const titre = String(b.titre || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().substring(0, 120) || 'Sans titre';
    try {
      const checkRes = await fetch(
        SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email) + '&select=id',
        { headers }
      );
      const checkData = await checkRes.json();
      if (!Array.isArray(checkData) || checkData.length === 0) {
        return res.status(403).json({ error: 'Compte introuvable.' });
      }
      const countRes = await fetch(
        SUPABASE_URL + '/rest/v1/fiches?user_email=eq.' + encodeURIComponent(email) + '&select=id&limit=1',
        { headers: { ...headers, 'Prefer': 'count=exact' } }
      );
      const total = parseInt((countRes.headers.get('content-range') || '').split('/')[1], 10);
      if (total >= MAX_FICHES_PER_USER) {
        return res.status(403).json({ error: 'Ta bibliothèque est pleine (' + MAX_FICHES_PER_USER + ' fiches). Supprime d\'anciennes fiches pour en ajouter.' });
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
          format: format,
          format_icon: FORMAT_ICONS[format],
          titre: titre,
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
