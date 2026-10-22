// API réservée à l'administrateur du site. Toute action nécessite un token Supabase valide
// appartenant à un compte ayant is_dev = true en base (vérifié à chaque appel).
export default async function handler(req, res) {
  const allowedOrigins = ['https://studyai-kappa-swart.vercel.app', 'https://ficheai.fr'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SERVICE_KEY) {
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  const { secret, action, payload } = req.body || {};

  if (!secret) {
    return res.status(403).json({ error: 'Accès refusé.' });
  }

  // Étape 1 : vérifier que le token Supabase est valide et récupérer l'email associé.
  let callerEmail = null;
  try {
    const userR = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + secret }
    });
    if (!userR.ok) return res.status(403).json({ error: 'Session invalide, reconnecte-toi.' });
    const userData = await userR.json();
    callerEmail = userData.email;
    if (!callerEmail) return res.status(403).json({ error: 'Session invalide.' });
  } catch (e) {
    return res.status(403).json({ error: 'Impossible de vérifier la session.' });
  }

  const sb = { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' };

  // Étape 2 : vérifier que ce compte a bien le statut développeur/admin en base.
  try {
    const devCheckR = await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(callerEmail) + '&select=is_dev', { headers: sb });
    const devCheckData = await devCheckR.json();
    if (!devCheckData || !devCheckData[0] || !devCheckData[0].is_dev) {
      return res.status(403).json({ error: 'Ce compte n\'a pas accès au panneau admin.' });
    }
  } catch (e) {
    return res.status(403).json({ error: 'Impossible de vérifier les droits admin.' });
  }

  try {
    // ── Statistiques générales ──
    if (action === 'get_stats') {
      const usersR = await fetch(SUPABASE_URL + '/rest/v1/users?select=email,username,plan,generations_used,generations_limit,chat_messages_used,chat_messages_limit,flashcards_used,flashcards_limit,niveau_scolaire,quota_period_start,plan_expires_at,created_at,banned,banned_until,banned_reason', { headers: sb });
      const users = await usersR.json();
      // Le compteur mensuel se remet à zéro au prochain usage ; ici on affiche la valeur réelle (0 si la période est expirée).
      const monthAgo = Date.now() - 31 * 24 * 3600 * 1000;
      users.forEach(u => {
        if (!u.quota_period_start || new Date(u.quota_period_start).getTime() <= monthAgo) {
          u.generations_used = 0; u.chat_messages_used = 0; u.flashcards_used = 0;
        }
      });
      const fichesR = await fetch(SUPABASE_URL + '/rest/v1/fiches?select=id&limit=1', { headers: { ...sb, 'Prefer': 'count=exact' } });
      const fichesCount = fichesR.headers.get('content-range')?.split('/')[1] || '0';
      return res.status(200).json({
        total_users: users.length,
        par_plan: {
          starter: users.filter(u => u.plan === 'starter').length,
          pro: users.filter(u => u.plan === 'pro').length,
          ultimate: users.filter(u => u.plan === 'ultimate').length
        },
        bannis: users.filter(u => u.banned).length,
        total_fiches: fichesCount,
        users: users
      });
    }

    // ── Fiches générées récemment — pseudo affiché à la place de l'email ──
    if (action === 'get_recent_fiches') {
      const limit = Math.min(Math.max(parseInt(payload && payload.limit, 10) || 30, 1), 200);
      // Jointure avec users pour récupérer le username via la foreign key user_email
      const fichesR = await fetch(
        SUPABASE_URL + '/rest/v1/fiches?select=created_at,user_email,format,format_icon,titre,users!fiches_user_email_fkey(username)&order=created_at.desc&limit=' + limit,
        { headers: sb }
      );
      const fiches = await fichesR.json();
      // Aplatir : extraire username depuis l'objet imbriqué users
      const fichesFlat = fiches.map(function(f) {
        return {
          created_at: f.created_at,
          user_email: f.user_email,
          user_username: (f.users && f.users.username) ? f.users.username : null,
          format: f.format,
          format_icon: f.format_icon,
          titre: f.titre
        };
      });
      return res.status(200).json({ fiches: fichesFlat });
    }

    // ── Bannir / débannir un compte, avec durée optionnelle ──
    if (action === 'set_ban') {
      const { email, banned, reason, durationHours } = payload || {};
      if (!email) return res.status(400).json({ error: 'Email manquant' });
      const body = { banned: !!banned, banned_reason: banned ? (reason || 'Non précisé') : null };
      if (banned) {
        body.banned_until = durationHours ? new Date(Date.now() + durationHours * 3600 * 1000).toISOString() : null;
      } else {
        body.banned_until = null;
      }
      const r = await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email), {
        method: 'PATCH', headers: { ...sb, 'Prefer': 'return=representation' },
        body: JSON.stringify(body)
      });
      const result = await r.json();
      return res.status(200).json({ success: true, result });
    }

    // ── Activer / désactiver le mode maintenance, avec délai de grâce de 2 minutes ──
    if (action === 'set_maintenance') {
      const { enabled, message } = payload || {};
      const GRACE_PERIOD_SECONDS = 120;
      const body = { maintenance_mode: !!enabled, updated_at: new Date().toISOString() };
      if (message) body.maintenance_message = message;
      body.maintenance_starts_at = enabled ? new Date(Date.now() + GRACE_PERIOD_SECONDS * 1000).toISOString() : null;
      const r = await fetch(SUPABASE_URL + '/rest/v1/site_settings?id=eq.1', {
        method: 'PATCH', headers: { ...sb, 'Prefer': 'return=representation' },
        body: JSON.stringify(body)
      });
      const result = await r.json();
      return res.status(200).json({ success: true, result, grace_period_seconds: GRACE_PERIOD_SECONDS });
    }

    // ── Modifier manuellement le plan/quota d'un utilisateur ──
    if (action === 'set_plan') {
      const { email, plan, generations_limit, chat_messages_limit, flashcards_limit, days } = payload || {};
      if (!email) return res.status(400).json({ error: 'Email manquant' });
      const body = {};
      if (plan) {
        body.plan = plan;
        // Changement de plan par l'admin = nouvelle période : compteurs remis à zéro.
        body.generations_used = 0; body.chat_messages_used = 0; body.flashcards_used = 0;
        body.generations_used_today = 0; body.chat_used_today = 0; body.flashcards_used_today = 0;
        body.quota_period_start = new Date().toISOString();
        // Accès offert pour une durée limitée : repasse automatiquement en Starter à l'échéance (vérifié toutes les 10 min).
        const d = parseInt(days, 10);
        body.plan_expires_at = (plan !== 'starter' && d > 0 && d <= 366) ? new Date(Date.now() + d * 86400000).toISOString() : null;
      }
      if (generations_limit !== undefined) body.generations_limit = generations_limit;
      if (chat_messages_limit !== undefined) body.chat_messages_limit = chat_messages_limit;
      if (flashcards_limit !== undefined) body.flashcards_limit = flashcards_limit;
      const r = await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email), {
        method: 'PATCH', headers: { ...sb, 'Prefer': 'return=representation' },
        body: JSON.stringify(body)
      });
      const result = await r.json();
      return res.status(200).json({ success: true, result });
    }

    // ── Supprimer définitivement un compte ──
    if (action === 'delete_account') {
      const { email } = payload || {};
      if (!email) return res.status(400).json({ error: 'Email manquant' });
      await fetch(SUPABASE_URL + '/rest/v1/chat_conversations?user_email=eq.' + encodeURIComponent(email), { method: 'DELETE', headers: sb }).catch(() => {});
      await fetch(SUPABASE_URL + '/rest/v1/api_usage?user_email=eq.' + encodeURIComponent(email), { method: 'DELETE', headers: sb }).catch(() => {});
      const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/delete_account_by_email', {
        method: 'POST', headers: sb, body: JSON.stringify({ p_email: email })
      });
      const result = await r.json();
      return res.status(200).json(result);
    }

    // ── Consommation de l'API IA : totaux par utilisateur (30 jours) + dernières activités ──
    if (action === 'get_api_usage') {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const r = await fetch(SUPABASE_URL + '/rest/v1/api_usage?select=user_email,kind,input_tokens,output_tokens,cost_usd,created_at&created_at=gte.' + since + '&order=created_at.desc&limit=5000', { headers: sb });
      const rows = await r.json();
      const list = Array.isArray(rows) ? rows : [];
      const byUser = {};
      list.forEach(x => {
        const u = byUser[x.user_email] || (byUser[x.user_email] = { email: x.user_email, generations: 0, chats: 0, errors: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0 });
        // Les lignes « erreur:… » et « info:… » sont des événements (échecs, replis), pas des appels facturés.
        if (/^(erreur|info):/.test(String(x.kind))) { u.errors++; return; }
        if (String(x.kind).startsWith('chat')) u.chats++; else u.generations++;
        u.cost_usd += Number(x.cost_usd) || 0; u.input_tokens += x.input_tokens || 0; u.output_tokens += x.output_tokens || 0;
      });
      const users = Object.values(byUser).sort((a, b) => b.cost_usd - a.cost_usd);
      return res.status(200).json({
        total_cost_usd: users.reduce((s, u) => s + u.cost_usd, 0),
        users: users,
        recent: list.slice(0, 40)
      });
    }

    if (action === 'get_contact_messages') {
      const limit = Math.min(Math.max(parseInt(payload?.limit, 10) || 50, 1), 200);
      const onlyUnread = payload?.unread_only || false;
      let url = SUPABASE_URL + '/rest/v1/contact_messages?select=*&order=created_at.desc&limit=' + limit;
      if (onlyUnread) url += '&read=eq.false';
      const msgsR = await fetch(url, { headers: sb });
      const msgs = await msgsR.json();
      return res.status(200).json({ messages: msgs });
    }

    if (action === 'mark_contact_read') {
      const id = String((payload && payload.id) || '');
      if (!/^[0-9a-f-]{1,36}$/i.test(id)) return res.status(400).json({ error: 'ID manquant' });
      await fetch(SUPABASE_URL + '/rest/v1/contact_messages?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { ...sb, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ read: true })
      });
      return res.status(200).json({ success: true });
    }

    if (action === 'delete_contact_message') {
      const id = String((payload && payload.id) || '');
      if (!/^[0-9a-f-]{1,36}$/i.test(id)) return res.status(400).json({ error: 'ID manquant' });
      await fetch(SUPABASE_URL + '/rest/v1/contact_messages?id=eq.' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: { ...sb, 'Prefer': 'return=minimal' }
      });
      return res.status(200).json({ success: true });
    }

    // ── Déclarations de rétractation et de résiliation (à traiter rapidement : remboursement sous 14 jours) ──
    if (action === 'get_legal_requests') {
      const r = await fetch(SUPABASE_URL + '/rest/v1/legal_requests?select=*&order=created_at.desc&limit=100', { headers: sb });
      const rows = await r.json();
      return res.status(200).json({ requests: Array.isArray(rows) ? rows : [] });
    }

    if (action === 'set_legal_request_status') {
      const id = String((payload && payload.id) || '');
      const status = String((payload && payload.status) || '');
      if (!/^[0-9a-f-]{36}$/i.test(id) || !['recue', 'traitee', 'refusee'].includes(status)) {
        return res.status(400).json({ error: 'Paramètres invalides' });
      }
      const note = typeof (payload && payload.note) === 'string' ? payload.note.slice(0, 2000) : null;
      await fetch(SUPABASE_URL + '/rest/v1/legal_requests?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { ...sb, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status, admin_note: note, processed_at: status === 'recue' ? null : new Date().toISOString() })
      });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Action inconnue' });

  } catch (error) {
    console.error('Erreur admin:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
