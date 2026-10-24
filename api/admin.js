import { cancelAllSubscriptions } from './_stripe.js';
import { mfaMissing, MFA_REQUIRED } from './_mfa.js';
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
    if (mfaMissing(secret, userData)) return res.status(403).json(MFA_REQUIRED);
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
      const usersR = await fetch(SUPABASE_URL + '/rest/v1/users?select=email,username,plan,credits_used,credits_limit,bonus_generations,bonus_expires_at,approfondi_offerts,generations_used,generations_limit,chat_messages_used,chat_messages_limit,flashcards_used,flashcards_limit,niveau_scolaire,quota_period_start,plan_expires_at,created_at,banned,banned_until,banned_reason', { headers: sb });
      const users = await usersR.json();
      // Le compteur mensuel se remet à zéro au prochain usage ; ici on affiche la valeur réelle (0 si la période est expirée).
      const monthAgo = Date.now() - 31 * 24 * 3600 * 1000;
      users.forEach(u => {
        if (!u.quota_period_start || new Date(u.quota_period_start).getTime() <= monthAgo) {
          u.credits_used = 0; u.generations_used = 0; u.chat_messages_used = 0; u.flashcards_used = 0;
        }
      });
      // Comptes protégés par la double authentification (date d'activation)
      try {
        const mr = await fetch(SUPABASE_URL + '/rest/v1/rpc/admin_mfa_users', { method: 'POST', headers: sb, body: '{}' });
        const mfa = await mr.json();
        const since = {};
        (Array.isArray(mfa) ? mfa : []).forEach(m => { if (m && m.email) since[String(m.email).toLowerCase()] = m.since; });
        users.forEach(u => { u.mfa_since = since[String(u.email || '').toLowerCase()] || null; });
      } catch (e) { /* information facultative */ }
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
      if (typeof message === 'string') body.maintenance_message = message.trim().slice(0, 300) || 'FicheAI est en maintenance. On revient très vite !';
      body.maintenance_starts_at = enabled ? new Date(Date.now() + GRACE_PERIOD_SECONDS * 1000).toISOString() : null;
      // Écriture « upsert » : crée la ligne de réglages si elle n'existe pas (cause de la panne du 23/10/2026).
      const r = await fetch(SUPABASE_URL + '/rest/v1/site_settings?on_conflict=id', {
        method: 'POST', headers: { ...sb, 'Prefer': 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify(Object.assign({ id: 1 }, body))
      });
      const result = await r.json();
      return res.status(200).json({ success: true, result, grace_period_seconds: GRACE_PERIOD_SECONDS });
    }

    // ── Modifier manuellement le plan/quota d'un utilisateur ──
    if (action === 'set_plan') {
      const { email, plan, credits_limit, generations_limit, chat_messages_limit, flashcards_limit, days } = payload || {};
      if (!email) return res.status(400).json({ error: 'Email manquant' });
      const body = {};
      if (plan) {
        body.plan = plan;
        // Changement de plan par l'admin = nouvelle période : compteurs remis à zéro.
        body.credits_used = 0; body.credits_used_today = 0;
        if (credits_limit === undefined) body.credits_limit = plan === 'ultimate' ? 250 : plan === 'pro' ? 110 : 10;
        body.generations_used = 0; body.chat_messages_used = 0; body.flashcards_used = 0;
        body.generations_used_today = 0; body.chat_used_today = 0; body.flashcards_used_today = 0;
        body.quota_period_start = new Date().toISOString();
        // Accès offert pour une durée limitée : repasse automatiquement en Starter à l'échéance (vérifié toutes les 10 min).
        const d = parseInt(days, 10);
        body.plan_expires_at = (plan !== 'starter' && d > 0 && d <= 366) ? new Date(Date.now() + d * 86400000).toISOString() : null;
      }
      if (credits_limit !== undefined) { const c = parseInt(credits_limit, 10); if (c >= 0 && c <= 999999) body.credits_limit = c; }
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

    // ── Offrir des crédits (ajoutés au solde de recharge, valable 12 mois) ──
    if (action === 'grant_bonus_generations') {
      const { email, amount } = payload || {};
      const n = parseInt(amount, 10);
      if (!email || !(n > 0 && n <= 1000)) return res.status(400).json({ error: 'Email ou nombre de crédits invalide' });
      const gr = await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email) + '&select=bonus_generations,bonus_expires_at', { headers: sb });
      const rows = await gr.json();
      const u = Array.isArray(rows) ? rows[0] : null;
      if (!u) return res.status(404).json({ error: 'Compte introuvable' });
      const valid = (u.bonus_generations || 0) > 0 && (!u.bonus_expires_at || new Date(u.bonus_expires_at) > new Date());
      const newBonus = (valid ? u.bonus_generations : 0) + n;
      await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email), {
        method: 'PATCH', headers: { ...sb, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ bonus_generations: newBonus, bonus_expires_at: new Date(Date.now() + 365 * 86400000).toISOString() })
      });
      return res.status(200).json({ success: true, new_bonus: newBonus });
    }

    // ── Message de l'admin à un élève (affiché dans FicheAI à sa prochaine visite) ──
    if (action === 'send_user_message') {
      const { email, body } = payload || {};
      const text = String(body || '').trim();
      if (!email || !text || text.length > 2000) return res.status(400).json({ error: 'Email ou message invalide (2000 caractères maximum)' });
      const ur = await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email) + '&select=email', { headers: sb });
      const found = await ur.json();
      if (!Array.isArray(found) || !found[0]) return res.status(404).json({ error: 'Aucun compte FicheAI avec cet email' });
      const r = await fetch(SUPABASE_URL + '/rest/v1/user_messages', {
        method: 'POST', headers: { ...sb, 'Prefer': 'return=representation' },
        body: JSON.stringify({ user_email: found[0].email, body: text })
      });
      const rows = await r.json();
      if (!r.ok) return res.status(500).json({ error: 'Enregistrement impossible' });
      return res.status(200).json({ success: true, message: rows[0] });
    }
    if (action === 'get_user_messages') {
      const r = await fetch(SUPABASE_URL + '/rest/v1/user_messages?select=id,user_email,body,created_at,read_at&order=created_at.desc&limit=30', { headers: sb });
      const rows = await r.json();
      return res.status(200).json({ messages: Array.isArray(rows) ? rows : [] });
    }

    // ── Double authentification d'un élève : état et désactivation (téléphone perdu) ──
    // À n'utiliser qu'après avoir vérifié l'identité de l'élève par un autre moyen.
    if (action === 'get_mfa_status' || action === 'reset_mfa') {
      const { email } = payload || {};
      if (!email) return res.status(400).json({ error: 'Email manquant' });
      const ur = await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(String(email).trim().toLowerCase()) + '&select=id,email', { headers: sb });
      const found = await ur.json();
      if (!Array.isArray(found) || !found[0]) return res.status(404).json({ error: 'Aucun compte FicheAI avec cet email' });
      const uid = found[0].id;
      const au = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + uid, { headers: sb });
      if (!au.ok) return res.status(502).json({ error: 'Lecture du compte impossible' });
      const authUser = await au.json();
      const factors = (Array.isArray(authUser.factors) ? authUser.factors : []).filter(f => f && f.factor_type === 'totp');
      const verified = factors.filter(f => f.status === 'verified');
      if (action === 'get_mfa_status') {
        return res.status(200).json({ email: found[0].email, enabled: verified.length > 0, since: verified[0] ? verified[0].created_at : null });
      }
      let removed = 0;
      for (const f of factors) {
        const d = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + uid + '/factors/' + f.id, { method: 'DELETE', headers: sb });
        if (d.ok) removed++;
      }
      return res.status(200).json({ success: removed === factors.length, removed, had2fa: verified.length > 0 });
    }

    if (action === 'delete_account') {
      const { email } = payload || {};
      if (!email) return res.status(400).json({ error: 'Email manquant' });
      // Abonnement Stripe résilié d'abord : un compte supprimé ne doit plus être prélevé.
      const cu = await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email) + '&select=stripe_customer_id', { headers: sb });
      const cuRows = await cu.json().catch(() => []);
      const cancel = await cancelAllSubscriptions(Array.isArray(cuRows) && cuRows[0] ? cuRows[0].stripe_customer_id : null, process.env.STRIPE_SECRET_KEY);
      if (!cancel.ok) return res.status(502).json({ error: 'Résiliation Stripe impossible, compte conservé : ' + cancel.error });
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
      const r = await fetch(SUPABASE_URL + '/rest/v1/api_usage?select=user_email,kind,model,input_tokens,output_tokens,cost_usd,created_at&created_at=gte.' + since + '&order=created_at.desc&limit=5000', { headers: sb });
      const rows = await r.json();
      const list = Array.isArray(rows) ? rows : [];
      const byUser = {};
      list.forEach(x => {
        const u = byUser[x.user_email] || (byUser[x.user_email] = { email: x.user_email, generations: 0, rapide: 0, approfondi: 0, chats: 0, revision: 0, credits: 0, errors: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0 });
        // Les lignes « erreur:… » et « info:… » sont des événements (échecs, replis), pas des appels facturés.
        if (/^(erreur|info):/.test(String(x.kind))) { u.errors++; return; }
        // Crédits estimés à partir du journal : Rapide (Haiku) 1, Approfondi (Sonnet) 2, chat 1, paquet de révision 1.
        const k = String(x.kind);
        if (k.startsWith('chat')) { u.chats++; u.credits += 1; }
        else if (k.startsWith('flashcards')) { u.revision++; u.credits += 1; }
        else { u.generations++; if (String(x.model).includes('haiku')) { u.rapide++; u.credits += 1; } else { u.approfondi++; u.credits += 2; } }
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
