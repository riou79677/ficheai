import crypto from 'node:crypto';

// IMPORTANT : le webhook a besoin du corps brut (non parsé) pour vérifier la signature Stripe.
export const config = { api: { bodyParser: false } };

const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';

// Lit le corps brut de la requête (nécessaire pour la vérification de signature).
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Vérifie la signature Stripe (HMAC-SHA256) sans dépendance externe.
function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader) return false;
  const parts = {};
  for (const item of sigHeader.split(',')) {
    const [k, v] = item.split('=');
    parts[k] = v;
  }
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Anti-rejeu : refuse les événements de plus de 5 minutes.
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp + '.' + rawBody)
    .digest('hex');

  // Comparaison à temps constant (évite les attaques temporelles).
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Fail-closed : si le serveur est mal configuré, on refuse au lieu d'accepter à l'aveugle.
  if (!WEBHOOK_SECRET || !SERVICE_KEY) {
    console.error('Webhook mal configuré : variable(s) d\'environnement manquante(s).');
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  const rawBody = await readRawBody(req);
  const sig = req.headers['stripe-signature'];

  // ── SÉCURITÉ : on ne fait confiance qu'aux événements réellement signés par Stripe ──
  if (!verifyStripeSignature(rawBody, sig, WEBHOOK_SECRET)) {
    console.warn('Webhook : signature invalide, requête rejetée.');
    return res.status(400).json({ error: 'Signature invalide' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (e) {
    return res.status(400).json({ error: 'Corps invalide' });
  }

  // Price IDs Stripe
  const PLANS = {
    'price_1TXfc5JBbEVt3aRD8UpsC4Ym': { plan: 'pro',      genLimit: 50,     chatLimit: 200 },      // Pro mensuel
    'price_1TXfefJBbEVt3aRDhNEcUNQl': { plan: 'pro',      genLimit: 50,     chatLimit: 200 },      // Pro annuel
    'price_1TXfiUJBbEVt3aRDXGVS7pAz': { plan: 'ultimate', genLimit: 999999, chatLimit: 999999 },  // Ultimate mensuel
    'price_1TXfj3JBbEVt3aRDei6gdSy0': { plan: 'ultimate', genLimit: 999999, chatLimit: 999999 },  // Ultimate annuel
  };

  // Met à jour le plan d'un utilisateur dans Supabase via la clé service_role
  // (contourne RLS de façon légitime, côté serveur uniquement).
  async function updateUserPlan(email, fields) {
    const resp = await fetch(
      SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email),
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': 'Bearer ' + SERVICE_KEY,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(fields)
      }
    );
    if (!resp.ok) {
      console.error('Échec MAJ Supabase:', resp.status, await resp.text());
    }
    return resp.ok;
  }

  // Récupère l'email du client Stripe à partir de son ID.
  async function getCustomerEmail(customerId) {
    const r = await fetch('https://api.stripe.com/v1/customers/' + customerId, {
      headers: { 'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY }
    });
    const c = await r.json();
    return c.email || null;
  }

  try {
    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated'
    ) {
      const subscription = event.data.object;
      const priceId = subscription.items?.data?.[0]?.price?.id;
      const customerId = subscription.customer;
      const status = subscription.status;

      const email = await getCustomerEmail(customerId);
      if (!email) return res.status(200).json({ received: true });

      let fields;
      const isActive = (status === 'active' || status === 'trialing');
      if (isActive && priceId && PLANS[priceId]) {
        const p = PLANS[priceId];
        fields = {
          plan: p.plan,
          generations_limit: p.genLimit,
          generations_used: 0,
          chat_messages_limit: p.chatLimit,
          chat_messages_used: 0,
          stripe_customer_id: customerId
        };
      } else {
        // Annulé / impayé / en retard → retour au plan gratuit.
        fields = {
          plan: 'starter',
          generations_limit: 5,
          generations_used: 0,
          chat_messages_limit: 0,
          chat_messages_used: 0,
          stripe_customer_id: customerId
        };
      }

      await updateUserPlan(email, fields);
      console.log('Plan mis à jour:', email, '->', fields.plan);
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const email = await getCustomerEmail(subscription.customer);
      if (email) {
        await updateUserPlan(email, {
          plan: 'starter',
          generations_limit: 5,
          generations_used: 0,
          chat_messages_limit: 0,
          chat_messages_used: 0
        });
        console.log('Abonnement annulé:', email, '-> starter');
      }
    }
  } catch (err) {
    console.error('Erreur webhook:', err);
    // On renvoie 200 pour éviter que Stripe ne rejoue en boucle un événement déjà validé.
  }

  return res.status(200).json({ received: true });
}
