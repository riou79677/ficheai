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

  const { plan, billing, email } = body;

  if (!email || !plan) {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }

  // Price IDs selon plan + fréquence
  const PRICE_IDS = {
    pro_monthly:      'price_1TXfc5JBbEVt3aRD8UpsC4Ym',
    pro_yearly:       'price_1TXfefJBbEVt3aRDhNEcUNQl',
    ultimate_monthly: 'price_1TXfiUJBbEVt3aRDXGVS7pAz',
    ultimate_yearly:  'price_1TXfj3JBbEVt3aRDei6gdSy0',
  };

  const key = `${plan}_${billing === 'yearly' ? 'yearly' : 'monthly'}`;
  const priceId = PRICE_IDS[key];

  if (!priceId) {
    return res.status(400).json({ error: 'Plan invalide' });
  }

  const BASE_URL = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://studyai-kappa-swart.vercel.app';

  // Essai gratuit uniquement pour Pro mensuel
  const trialDays = (plan === 'pro' && billing !== 'yearly') ? 7 : 0;

  const params = new URLSearchParams();
  params.append('mode', 'subscription');
  params.append('customer_email', email);
  params.append('line_items[0][price]', priceId);
  params.append('line_items[0][quantity]', '1');
  params.append('success_url', `${BASE_URL}/confirmation.html?session_id={CHECKOUT_SESSION_ID}`);
  params.append('cancel_url', `${BASE_URL}/index.html#tarifs`);
  if (trialDays > 0) {
    params.append('subscription_data[trial_period_days]', trialDays.toString());
  }
  // Pré-remplir l'email et empêcher de le changer
  params.append('customer_creation', 'always');

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
