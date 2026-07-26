// API réservée à l'administrateur du site. Toute action nécessite le secret ADMIN_SECRET
// (configuré uniquement dans les variables d'environnement Vercel, jamais visible côté client).
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ADMIN_SECRET = process.env.ADMIN_SECRET;

  if (!SERVICE_KEY || !ADMIN_SECRET) {
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  const { secret, action, payload } = req.body || {};

  // Vérification du mot de passe secret, avant toute action
  if (!secret || secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Accès refusé.' });
  }

  const sb = { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' };

  try {
    // ── Statistiques générales ──
    if (action === 'get_stats') {
      const usersR = await fetch(SUPABASE_URL + '/rest/v1/users?select=email,plan,generations_used,created_at,banned,banned_until', { headers: sb });
      const users = await usersR.json();
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
      const { email, plan, generations_limit, chat_messages_limit, flashcards_limit } = payload || {};
      if (!email) return res.status(400).json({ error: 'Email manquant' });
      const body = {};
      if (plan) body.plan = plan;
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

    // ── Supprimer définitivement un compte (via la fonction déjà sécurisée existante) ──
    if (action === 'delete_account') {
      const { email } = payload || {};
      if (!email) return res.status(400).json({ error: 'Email manquant' });
      const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/delete_account_by_email', {
        method: 'POST', headers: sb, body: JSON.stringify({ p_email: email })
      });
      const result = await r.json();
      return res.status(200).json(result);
    }

    return res.status(400).json({ error: 'Action inconnue' });

  } catch (error) {
    console.error('Erreur admin:', error);
    return res.status(500).json({ error: error.message });
  }
}
