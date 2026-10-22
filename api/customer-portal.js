const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';

  if (!STRIPE_SECRET_KEY || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  // 1. Vérifier le token Supabase et récupérer l'email
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Connecte-toi pour gérer ton abonnement.' });

  let email;
  try {
    const authRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + token }
    });
    if (!authRes.ok) return res.status(401).json({ error: 'Session invalide, reconnecte-toi.' });
    const authData = await authRes.json();
    email = authData.email;
    if (!email) return res.status(401).json({ error: 'Session invalide.' });
  } catch(e) {
    return res.status(503).json({ error: 'Service momentanément indisponible' });
  }

  // 2. Chercher le stripe_customer_id dans la table users
  const sb = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY
  };

  let customerId;
  try {
    const userRes = await fetch(
      SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email) + '&select=stripe_customer_id',
      { headers: sb }
    );
    const users = await userRes.json();
    customerId = users?.[0]?.stripe_customer_id;
  } catch(e) {
    return res.status(503).json({ error: 'Erreur lors de la récupération du compte.' });
  }

  // 3. Si pas de customer Stripe → l'utilisateur n'a jamais payé
  if (!customerId) {
    return res.status(404).json({
      error: 'Aucun abonnement actif trouvé pour ce compte.',
      code: 'NO_SUBSCRIPTION'
    });
  }

  // 4. Créer une session portail Stripe dynamique.
  // Avec { flow: 'cancel' } (bouton « Résilier mon abonnement »), le portail s'ouvre directement sur la
  // résiliation de l'abonnement en cours (fonction de résiliation « en trois clics », art. L215-1-1).
  const SITE_ORIGINS = ['https://studyai-kappa-swart.vercel.app', 'https://ficheai.fr', 'https://www.ficheai.fr'];
  const BASE_URL = SITE_ORIGINS.includes(req.headers.origin) ? req.headers.origin : SITE_ORIGINS[0];
  const sh = { 'Authorization': 'Bearer ' + STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' };
  const wantsCancel = !!(req.body && req.body.flow === 'cancel');

  const createPortal = async (subscriptionId) => {
    const params = new URLSearchParams();
    params.append('customer', customerId);
    params.append('return_url', BASE_URL + '/settings.html');
    params.append('locale', 'fr');
    if (subscriptionId) {
      params.append('flow_data[type]', 'subscription_cancel');
      params.append('flow_data[subscription_cancel][subscription]', subscriptionId);
      params.append('flow_data[after_completion][type]', 'redirect');
      params.append('flow_data[after_completion][redirect][return_url]', BASE_URL + '/settings.html?resiliation=ok');
    }
    const r = await fetch('https://api.stripe.com/v1/billing_portal/sessions', { method: 'POST', headers: sh, body: params.toString() });
    return { ok: r.ok, data: await r.json() };
  };

  try {
    let subscriptionId = null;
    if (wantsCancel) {
      const subsRes = await fetch('https://api.stripe.com/v1/subscriptions?customer=' + encodeURIComponent(customerId) + '&status=all&limit=10', { headers: sh });
      const subs = await subsRes.json();
      const sub = (subs.data || []).find(x => (x.status === 'active' || x.status === 'trialing' || x.status === 'past_due') && !x.cancel_at_period_end);
      if (!sub) {
        const already = (subs.data || []).find(x => (x.status === 'active' || x.status === 'trialing') && x.cancel_at_period_end);
        if (already) {
          const end = new Date((already.cancel_at || already.current_period_end || already.items?.data?.[0]?.current_period_end || 0) * 1000);
          return res.status(200).json({ already_canceled: true, ends_at: isNaN(end) ? null : end.toISOString() });
        }
        return res.status(404).json({ error: 'Aucun abonnement en cours à résilier sur ce compte.', code: 'NO_SUBSCRIPTION' });
      }
      subscriptionId = sub.id;
    }

    let out = await createPortal(subscriptionId);
    if (!out.ok && subscriptionId) {
      // Portail configuré sans résiliation directe : on ouvre le portail classique (la résiliation y reste possible).
      console.error('Portail (résiliation directe) refusé :', out.data && out.data.error && out.data.error.message);
      out = await createPortal(null);
    }
    if (!out.ok) {
      console.error('Stripe portal error:', out.data);
      return res.status(500).json({ error: 'Le portail de gestion est momentanément indisponible. Réessaie dans un instant.' });
    }
    return res.status(200).json({ url: out.data.url });

  } catch(e) {
    return res.status(500).json({ error: 'Service momentanément indisponible' });
  }
}
