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

  // 4. Créer une session portail Stripe dynamique
  const BASE_URL = 'https://studyai-kappa-swart.vercel.app';
  const params = new URLSearchParams();
  params.append('customer', customerId);
  params.append('return_url', BASE_URL + '/settings.html');

  try {
    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const session = await portalRes.json();

    if (!portalRes.ok) {
      console.error('Stripe portal error:', session);
      return res.status(500).json({ error: 'Erreur Stripe : ' + (session.error?.message || 'inconnue') });
    }

    return res.status(200).json({ url: session.url });

  } catch(e) {
    return res.status(500).json({ error: 'Service momentanément indisponible' });
  }
}
