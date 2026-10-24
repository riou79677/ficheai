import { mfaMissing, MFA_REQUIRED } from './_mfa.js';
// Historique du Chat IA : liste, lecture, enregistrement, renommage, suppression.
// L'email vient toujours du jeton de connexion. Le texte des cours n'est jamais enregistré, seulement les messages du chat.
const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';
const KEEP = { pro: 5, ultimate: 200 };          // nombre de conversations conservées par plan
const MAX_MESSAGES = 60, MAX_CHARS = 8000, MAX_TOTAL = 120000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Configuration serveur incomplète' });
  const ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';
  const sb = { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' };

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Connecte-toi pour continuer.' });
  let email;
  try {
    const a = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: ANON, Authorization: 'Bearer ' + token } });
    if (!a.ok) return res.status(401).json({ error: 'Session invalide, reconnecte-toi.' });
    const authData = await a.json();
    email = authData.email;
    if (!email) return res.status(401).json({ error: 'Session invalide.' });
    if (mfaMissing(token, authData)) return res.status(401).json(MFA_REQUIRED);
  } catch (e) { return res.status(503).json({ error: 'Service momentanément indisponible' }); }

  let plan = 'starter';
  try {
    const u = await (await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email) + '&select=plan', { headers: sb })).json();
    plan = (Array.isArray(u) && u[0] && u[0].plan) || 'starter';
  } catch (e) { return res.status(503).json({ error: 'Service momentanément indisponible' }); }
  if (plan === 'starter') return res.status(403).json({ error: 'L\'historique du Chat IA est disponible à partir du plan Pro.' });

  const mine = 'user_email=eq.' + encodeURIComponent(email);
  const idParam = (req.query && req.query.id) || null;
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : (req.body || {});

  try {
    if (req.method === 'GET') {
      if (idParam) {
        if (!UUID.test(idParam)) return res.status(400).json({ error: 'Identifiant invalide' });
        const r = await (await fetch(SUPABASE_URL + '/rest/v1/chat_conversations?id=eq.' + idParam + '&' + mine + '&select=id,title,messages,updated_at', { headers: sb })).json();
        if (!Array.isArray(r) || !r[0]) return res.status(404).json({ error: 'Conversation introuvable' });
        return res.status(200).json(r[0]);
      }
      const r = await (await fetch(SUPABASE_URL + '/rest/v1/chat_conversations?' + mine + '&select=id,title,updated_at&order=updated_at.desc&limit=' + (KEEP[plan] || 5), { headers: sb })).json();
      return res.status(200).json({ conversations: Array.isArray(r) ? r : [], plan });
    }

    if (req.method === 'POST') {
      const msgs = Array.isArray(body.messages) ? body.messages : null;
      if (!msgs || !msgs.length) return res.status(400).json({ error: 'Messages manquants' });
      const clean = msgs.slice(-MAX_MESSAGES)
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
      if (!clean.length || JSON.stringify(clean).length > MAX_TOTAL) return res.status(400).json({ error: 'Conversation trop volumineuse' });
      const title = String(body.title || clean[0].content || 'Nouvelle conversation').replace(/\s+/g, ' ').trim().slice(0, 70) || 'Nouvelle conversation';
      const now = new Date().toISOString();
      let id = body.id;
      if (id) {
        if (!UUID.test(id)) return res.status(400).json({ error: 'Identifiant invalide' });
        const r = await fetch(SUPABASE_URL + '/rest/v1/chat_conversations?id=eq.' + id + '&' + mine, {
          method: 'PATCH', headers: { ...sb, Prefer: 'return=representation' }, body: JSON.stringify({ messages: clean, updated_at: now })
        });
        const j = await r.json();
        if (Array.isArray(j) && j[0]) return res.status(200).json({ id });
        id = null; // introuvable : on en crée une nouvelle
      }
      const r = await fetch(SUPABASE_URL + '/rest/v1/chat_conversations', {
        method: 'POST', headers: { ...sb, Prefer: 'return=representation' }, body: JSON.stringify({ user_email: email, title, messages: clean })
      });
      const j = await r.json();
      if (!r.ok || !Array.isArray(j) || !j[0]) { console.error('Insert conv:', j); return res.status(500).json({ error: 'Échec de l\'enregistrement' }); }
      // Pro : on ne garde que les N plus récentes
      const keep = KEEP[plan] || 5;
      const all = await (await fetch(SUPABASE_URL + '/rest/v1/chat_conversations?' + mine + '&select=id&order=updated_at.desc', { headers: sb })).json();
      if (Array.isArray(all) && all.length > keep) {
        const old = all.slice(keep).map(x => x.id);
        await fetch(SUPABASE_URL + '/rest/v1/chat_conversations?' + mine + '&id=in.(' + old.join(',') + ')', { method: 'DELETE', headers: sb });
      }
      return res.status(200).json({ id: j[0].id });
    }

    if (req.method === 'PATCH') {
      if (!idParam || !UUID.test(idParam)) return res.status(400).json({ error: 'Identifiant invalide' });
      const title = String(body.title || '').replace(/\s+/g, ' ').trim().slice(0, 70);
      if (!title) return res.status(400).json({ error: 'Titre manquant' });
      await fetch(SUPABASE_URL + '/rest/v1/chat_conversations?id=eq.' + idParam + '&' + mine, { method: 'PATCH', headers: sb, body: JSON.stringify({ title }) });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      if (!idParam || !UUID.test(idParam)) return res.status(400).json({ error: 'Identifiant invalide' });
      await fetch(SUPABASE_URL + '/rest/v1/chat_conversations?id=eq.' + idParam + '&' + mine, { method: 'DELETE', headers: sb });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (e) {
    console.error('Erreur conversations:', e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
