export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';

  // Price IDs Stripe
  const PLANS = {
    'price_1TXfc5JBbEVt3aRD8UpsC4Ym': { plan: 'pro',      limit: 50 },      // Pro mensuel
    'price_1TXfefJBbEVt3aRDhNEcUNQl': { plan: 'pro',      limit: 50 },      // Pro annuel
    'price_1TXfiUJBbEVt3aRDXGVS7pAz': { plan: 'ultimate', limit: 999999 },  // Ultimate mensuel
    'price_1TXfj3JBbEVt3aRDei6gdSy0': { plan: 'ultimate', limit: 999999 },  // Ultimate annuel
  };

  const event = req.body;

  try {
    // Abonnement créé ou mis à jour (après paiement réussi)
    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated'
    ) {
      const subscription = event.data.object;
      const priceId = subscription.items?.data[0]?.price?.id;
      const customerId = subscription.customer;
      const status = subscription.status;

      // Récupérer l'email du client via l'ID Stripe
      const customerRes = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
        headers: {
          'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY
        }
      });
      const customer = await customerRes.json();
      const email = customer.email;

      if (!email) {
        console.log('Email introuvable pour customer:', customerId);
        return res.status(200).json({ received: true });
      }

      // Déterminer le plan
      let plan = 'starter';
      let limit = 5;
      if (priceId && PLANS[priceId]) {
        plan = PLANS[priceId].plan;
        limit = PLANS[priceId].limit;
      }

      // Si abonnement annulé ou expiré → repasser en starter
      if (status === 'canceled' || status === 'unpaid' || status === 'past_due') {
        plan = 'starter';
        limit = 5;
      }

      // Mettre à jour Supabase
      await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY
        },
        body: JSON.stringify({
          plan: plan,
          generations_limit: limit,
          generations_used: 0,
          stripe_customer_id: customerId
        })
      });

      console.log('Plan mis à jour:', email, '->', plan);
    }

    // Abonnement annulé
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      const customerRes = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
        headers: { 'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY }
      });
      const customer = await customerRes.json();
      const email = customer.email;

      if (email) {
        await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY
          },
          body: JSON.stringify({
            plan: 'starter',
            generations_limit: 5,
            generations_used: 0
          })
        });
        console.log('Abonnement annulé:', email, '-> starter');
      }
    }

  } catch (err) {
    console.error('Erreur webhook:', err);
  }

  return res.status(200).json({ received: true });
}
