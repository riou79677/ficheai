export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Corps invalide' });
  }

  const { plan, billing } = body;
  if (!plan) return res.status(400).json({ error: 'Paramètres manquants' });

  // L'email vient du jeton de connexion, jamais du navigateur.
  const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Configuration serveur incomplète (SUPABASE_SERVICE_ROLE_KEY)' });
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Connecte-toi pour t\'abonner.' });
  let email;
  try {
    const a = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token } });
    if (!a.ok) return res.status(401).json({ error: 'Session expirée, reconnecte-toi.' });
    email = (await a.json()).email;
    if (!email) return res.status(401).json({ error: 'Session invalide.' });
  } catch (e) { return res.status(503).json({ error: 'Service momentanément indisponible' }); }

  let dbUser = null;
  try {
    const u = await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email) + '&select=plan,stripe_customer_id,has_used_trial',
      { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
    const arr = await u.json();
    dbUser = Array.isArray(arr) ? arr[0] : null;
  } catch (e) { return res.status(503).json({ error: 'Service momentanément indisponible' }); }
  if (!dbUser) return res.status(403).json({ error: 'Compte introuvable. Déconnecte-toi puis reconnecte-toi.' });

  // Un abonné ne peut pas reprendre son plan actuel ou un plan inférieur.
  const RANK = { starter: 0, pro: 1, ultimate: 2 };
  const current = dbUser.plan || 'starter';
  if ((RANK[plan] ?? 99) <= RANK[current] && RANK[current] > 0) {
    return res.status(409).json({ error: 'Tu as déjà ce plan ou un plan supérieur.' });
  }

  // Ultimate annuel supprimé volontairement — uniquement mensuel disponible
  const PRICE_IDS = {
    pro_monthly:      'price_1TXfc5JBbEVt3aRD8UpsC4Ym',
    pro_yearly:       'price_1USuiLJBbEVt3aRDV5FtLJtZ',
    ultimate_monthly: 'price_1TXfiUJBbEVt3aRDXGVS7pAz',
  };

  // Bloquer explicitement ultimate_yearly même si quelqu'un tente d'y accéder directement
  if (plan === 'ultimate' && billing === 'yearly') {
    return res.status(400).json({ error: 'L\'abonnement Ultimate annuel n\'est pas disponible.' });
  }

  const key = `${plan}_${billing === 'yearly' ? 'yearly' : 'monthly'}`;
  const priceId = PRICE_IDS[key];

  if (!priceId) {
    return res.status(400).json({ error: 'Plan invalide' });
  }

  const BASE_URL = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://studyai-kappa-swart.vercel.app';

  // Essai gratuit uniquement pour Pro mensuel
  const trialDays = (plan === 'pro' && billing !== 'yearly' && !dbUser.has_used_trial) ? 7 : 0;

  // Passage Pro -> Ultimate : on modifie l'abonnement existant (pas de double abonnement), au prorata.
  if (current === 'pro' && plan === 'ultimate' && dbUser.stripe_customer_id) {
    const sh = { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' };
    const subs = await (await fetch('https://api.stripe.com/v1/subscriptions?customer=' + encodeURIComponent(dbUser.stripe_customer_id) + '&status=all&limit=10', { headers: sh })).json();
    const sub = (subs.data || []).find(x => x.status === 'active' || x.status === 'trialing');
    if (sub && sub.items && sub.items.data[0]) {
      const p = new URLSearchParams();
      p.append('items[0][id]', sub.items.data[0].id);
      p.append('items[0][price]', priceId);
      p.append('proration_behavior', 'create_prorations');
      p.append('payment_behavior', 'error_if_incomplete');
      if (sub.status === 'trialing') p.append('trial_end', 'now');
      const r = await fetch('https://api.stripe.com/v1/subscriptions/' + sub.id, { method: 'POST', headers: sh, body: p.toString() });
      const j = await r.json();
      if (!r.ok) {
        console.error('Stripe upgrade error:', j);
        return res.status(500).json({ error: 'Passage à Ultimate impossible', detail: (j.error && j.error.message) || '' });
      }
      return res.status(200).json({ upgraded: true, url: `${BASE_URL}/confirmation.html?plan=ultimate` });
    }
  }

  const params = new URLSearchParams();
  params.append('mode', 'subscription');
  if (dbUser.stripe_customer_id) params.append('customer', dbUser.stripe_customer_id); else params.append('customer_email', email);
  params.append('line_items[0][price]', priceId);
  params.append('line_items[0][quantity]', '1');
  params.append('success_url', `${BASE_URL}/confirmation.html?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`);
  params.append('cancel_url', `${BASE_URL}/index.html#tarifs`);
  if (trialDays > 0) {
    params.append('subscription_data[trial_period_days]', trialDays.toString());
  }
  if (!dbUser.stripe_customer_id) params.append('customer_creation', 'always');

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const session = await response.json();

  if (!response.ok) {
    console.error('Stripe error:', session);
    return res.status(500).json({ error: 'Erreur Stripe', detail: session.error?.message });
  }

  return res.status(200).json({ url: session.url });
}
