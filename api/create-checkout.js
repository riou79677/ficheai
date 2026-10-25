import { mfaMissing, MFA_REQUIRED } from './_mfa.js';
// Création des paiements Stripe : abonnements (Pro, Ultimate) et recharges de crédits.
// Toute commande passe par le récapitulatif du site (checkout.js) : le client y voit le prix, la durée et les
// conditions, accepte les CGV et demande l'exécution immédiate. Ces consentements sont exigés ici et conservés
// dans les métadonnées Stripe de la commande (preuve en cas de litige).

// Interrupteur des ventes. Laisser à false tant que : la micro-entreprise n'est pas déclarée, les mentions légales
// ne sont pas complètes (nom, adresse, téléphone), le médiateur de la consommation n'est pas choisi et l'adresse
// e-mail de contact ne fonctionne pas. Passer à true pour rouvrir les abonnements et les recharges.
const SALES_OPEN = false;

// Version des CGV acceptée par le client (à changer à chaque modification des conditions de vente).
const CGV_VERSION = '2026-10-25';

const OFFERS = {
  pro_monthly:      { mode: 'subscription', plan: 'pro',      price: 'price_1TXfc5JBbEVt3aRD8UpsC4Ym', label: 'Pro mensuel',      amount: '7,99 €',  period: 'mois', trialDays: 7 },
  pro_yearly:       { mode: 'subscription', plan: 'pro',      price: 'price_1USuiLJBbEVt3aRDV5FtLJtZ', label: 'Pro annuel',       amount: '79,90 €', period: 'an' },
  ultimate_monthly: { mode: 'subscription', plan: 'ultimate', price: 'price_1TXfiUJBbEVt3aRDXGVS7pAz', label: 'Ultimate mensuel', amount: '14,99 €', period: 'mois' },
  recharge_50:      { mode: 'payment', credits: 100, price: 'price_1TvvwjJBbEVt3aRDYw3CewZz', label: 'Recharge de 100 crédits',  amount: '6,99 €' },
  recharge_150:     { mode: 'payment', credits: 300, price: 'price_1TvvwqJBbEVt3aRDRZXro9z5', label: 'Recharge de 300 crédits', amount: '19,99 €' },
  recharge_400:     { mode: 'payment', credits: 800, price: 'price_1TvvwxJBbEVt3aRDJN6pTiYz', label: 'Recharge de 800 crédits', amount: '49,99 €' },
};

const SITE_ORIGINS = ['https://studyai-kappa-swart.vercel.app', 'https://ficheai.fr', 'https://www.ficheai.fr'];

function frDate(d) {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
}

// Texte affiché juste au-dessus du bouton de paiement Stripe (1 200 caractères maximum).
function submitMessage(offer, trialDays, base) {
  const cgv = '[conditions générales](' + base + '/cgu.html#cgv)';
  const tva = 'Prix TTC, TVA non applicable (art. 293 B du CGI).';
  if (offer.mode === 'payment') {
    return '**Commande avec obligation de paiement** : paiement unique de ' + offer.amount + '. ' + tva
      + ' Les crédits sont ajoutés immédiatement et restent valables 12 mois. Tu as demandé leur fourniture immédiate'
      + ' et reconnu perdre ton droit de rétractation dès qu\'ils sont ajoutés. Voir les ' + cgv + '.';
  }
  const every = offer.period === 'an' ? 'chaque année' : 'chaque mois';
  const resil = 'Sans engagement : résiliable à tout moment depuis Paramètres, bouton « Résilier mon abonnement », effet à la fin de la période payée.';
  const retract = 'Tu disposes de 14 jours pour te rétracter (lien « Renoncer au contrat ici » en bas de chaque page).';
  if (trialDays > 0) {
    const first = frDate(new Date(Date.now() + trialDays * 86400000));
    return '**Commande avec obligation de paiement** : ' + trialDays + ' jours d\'essai gratuit, puis ' + offer.amount
      + ' par ' + offer.period + ', prélevés automatiquement à partir du ' + first + ' puis ' + every
      + ' jusqu\'à résiliation. Rien n\'est prélevé aujourd\'hui. ' + tva + ' ' + resil + ' ' + retract + ' Voir les ' + cgv + '.';
  }
  return '**Commande avec obligation de paiement** : ' + offer.amount + ' prélevés aujourd\'hui, puis ' + every
    + ' à la même date jusqu\'à résiliation (renouvellement automatique). ' + tva + ' ' + resil + ' ' + retract
    + ' Voir les ' + cgv + '.';
}

export default async function handler(req, res) {
  // État des ventes, lu par le récapitulatif de commande. Avec le jeton de connexion, on indique aussi
  // la formule actuelle et si l'essai gratuit est encore disponible pour ce compte.
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const out = { sales_open: SALES_OPEN, cgv_version: CGV_VERSION, plan: null, trial_available: null };
    const auth = req.headers['authorization'] || '';
    const tok = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (tok && SK) {
      try {
        const SUPA = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';
        const ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';
        const a = await fetch(SUPA + '/auth/v1/user', { headers: { apikey: ANON, Authorization: 'Bearer ' + tok } });
        if (a.ok) {
          const ad = await a.json();
          const em = mfaMissing(tok, ad) ? null : ad.email;
          if (em) {
            const u = await fetch(SUPA + '/rest/v1/users?email=eq.' + encodeURIComponent(em) + '&select=plan,has_used_trial', { headers: { apikey: SK, Authorization: 'Bearer ' + SK } });
            const arr = await u.json();
            if (Array.isArray(arr) && arr[0]) { out.plan = arr[0].plan || 'starter'; out.trial_available = !arr[0].has_used_trial; }
          }
        }
      } catch (e) { /* informations facultatives */ }
    }
    return res.status(200).json(out);
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'Corps invalide' });
  }

  if (!SALES_OPEN) {
    return res.status(503).json({
      error: 'Les abonnements ouvrent très bientôt : FicheAI finalise ses démarches légales. En attendant, le plan Starter reste gratuit.',
      code: 'SALES_CLOSED'
    });
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  // Offre demandée (ancien format { plan, billing } encore accepté).
  let offerKey = typeof body.offer === 'string' ? body.offer : null;
  if (!offerKey && body.plan) {
    offerKey = body.plan === 'pro' ? (body.billing === 'yearly' ? 'pro_yearly' : 'pro_monthly')
      : body.plan === 'ultimate' ? 'ultimate_monthly' : null;
  }
  const offer = offerKey && Object.prototype.hasOwnProperty.call(OFFERS, offerKey) ? OFFERS[offerKey] : null;
  if (!offer) return res.status(400).json({ error: 'Offre invalide' });

  // Consentements recueillis dans le récapitulatif : CGV acceptées et exécution immédiate demandée
  // (abonnement : art. L221-25 ; recharge : renoncement au droit de rétractation, art. L221-28 13°).
  const consent = body.consent || {};
  if (consent.cgv !== true || consent.immediate !== true) {
    return res.status(400).json({ error: 'Pour commander, coche les deux cases du récapitulatif.', code: 'CONSENT_REQUIRED' });
  }

  // L'email vient du jeton de connexion, jamais du navigateur.
  const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Configuration serveur incomplète (SUPABASE_SERVICE_ROLE_KEY)' });
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Connecte-toi pour commander.' });
  let email;
  try {
    const a = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token } });
    if (!a.ok) return res.status(401).json({ error: 'Session expirée, reconnecte-toi.' });
    const authData = await a.json();
    email = authData.email;
    if (!email) return res.status(401).json({ error: 'Session invalide.' });
    if (mfaMissing(token, authData)) return res.status(401).json(MFA_REQUIRED);
  } catch (e) { return res.status(503).json({ error: 'Service momentanément indisponible' }); }

  let dbUser = null;
  try {
    const u = await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email) + '&select=plan,stripe_customer_id,has_used_trial',
      { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
    const arr = await u.json();
    dbUser = Array.isArray(arr) ? arr[0] : null;
  } catch (e) { return res.status(503).json({ error: 'Service momentanément indisponible' }); }
  if (!dbUser) return res.status(403).json({ error: 'Compte introuvable. Déconnecte-toi puis reconnecte-toi.' });

  const RANK = { starter: 0, pro: 1, ultimate: 2 };
  const current = dbUser.plan || 'starter';

  if (offer.mode === 'subscription') {
    // Un abonné ne peut pas reprendre son plan actuel ou un plan inférieur.
    if ((RANK[offer.plan] ?? 99) <= RANK[current] && RANK[current] > 0) {
      return res.status(409).json({ error: 'Tu as déjà ce plan ou un plan supérieur.' });
    }
  } else if (current !== 'pro' && current !== 'ultimate') {
    return res.status(403).json({ error: 'Les recharges sont réservées aux abonnés Pro et Ultimate.' });
  }

  // Adresse de retour : toujours un domaine public du site (jamais l'adresse technique du déploiement).
  const BASE_URL = SITE_ORIGINS.includes(req.headers.origin) ? req.headers.origin : SITE_ORIGINS[0];
  const nowIso = new Date().toISOString();
  const meta = {
    offer: offerKey,
    cgv_version: CGV_VERSION,
    consent_cgv_at: nowIso,
    consent_immediate_at: nowIso,
    consent_source: 'recapitulatif-ficheai'
  };
  const sh = { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' };

  // Passage Pro -> Ultimate : on modifie l'abonnement existant (pas de double abonnement), au prorata.
  // Le bouton « Commander avec obligation de paiement » du récapitulatif vaut ici commande.
  if (offer.mode === 'subscription' && current === 'pro' && offer.plan === 'ultimate' && dbUser.stripe_customer_id) {
    const subs = await (await fetch('https://api.stripe.com/v1/subscriptions?customer=' + encodeURIComponent(dbUser.stripe_customer_id) + '&status=all&limit=10', { headers: sh })).json();
    const sub = (subs.data || []).find(x => x.status === 'active' || x.status === 'trialing');
    if (sub && sub.items && sub.items.data[0]) {
      const p = new URLSearchParams();
      p.append('items[0][id]', sub.items.data[0].id);
      p.append('items[0][price]', offer.price);
      p.append('proration_behavior', 'create_prorations');
      p.append('payment_behavior', 'error_if_incomplete');
      if (sub.status === 'trialing') p.append('trial_end', 'now');
      Object.entries(meta).forEach(([k, v]) => p.append('metadata[' + k + ']', v));
      const r = await fetch('https://api.stripe.com/v1/subscriptions/' + sub.id, { method: 'POST', headers: sh, body: p.toString() });
      const j = await r.json();
      if (!r.ok) {
        console.error('Stripe upgrade error:', j);
        return res.status(500).json({ error: 'Le passage à Ultimate n\'a pas pu être effectué. Vérifie ton moyen de paiement dans Paramètres, ou réessaie.' });
      }
      return res.status(200).json({ upgraded: true, url: `${BASE_URL}/confirmation.html?plan=ultimate` });
    }
  }

  // Essai gratuit uniquement pour Pro mensuel, une seule fois par compte.
  const trialDays = (offer.trialDays && !dbUser.has_used_trial) ? offer.trialDays : 0;

  const params = new URLSearchParams();
  params.append('mode', offer.mode);
  params.append('locale', 'fr');
  params.append('line_items[0][price]', offer.price);
  params.append('line_items[0][quantity]', '1');
  if (dbUser.stripe_customer_id) params.append('customer', dbUser.stripe_customer_id); else params.append('customer_email', email);
  params.append('custom_text[submit][message]', submitMessage(offer, trialDays, BASE_URL));
  Object.entries(meta).forEach(([k, v]) => params.append('metadata[' + k + ']', v));
  if (offer.mode === 'subscription') {
    params.append('success_url', `${BASE_URL}/confirmation.html?plan=${offer.plan}&session_id={CHECKOUT_SESSION_ID}`);
    params.append('cancel_url', `${BASE_URL}/settings.html`);
    Object.entries(meta).forEach(([k, v]) => params.append('subscription_data[metadata][' + k + ']', v));
    if (trialDays > 0) params.append('subscription_data[trial_period_days]', String(trialDays));
  } else {
    params.append('success_url', `${BASE_URL}/confirmation.html?type=recharge&amount=${offer.credits}`);
    params.append('cancel_url', `${BASE_URL}/app.html`);
    // « customer_creation » n'est accepté qu'en paiement unique (en abonnement, Stripe crée toujours le client).
    if (!dbUser.stripe_customer_id) params.append('customer_creation', 'always');
    // Facture automatique pour les achats ponctuels.
    params.append('invoice_creation[enabled]', 'true');
    params.append('invoice_creation[invoice_data][footer]', 'TVA non applicable, art. 293 B du CGI.');
    Object.entries(meta).forEach(([k, v]) => params.append('payment_intent_data[metadata][' + k + ']', v));
  }

  const createSession = async (withSubmitType) => {
    const p = new URLSearchParams(params);
    // Bouton Stripe « Payer » : le libellé doit exprimer l'obligation de paiement (art. L221-14).
    if (withSubmitType) p.append('submit_type', 'pay');
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: sh, body: p.toString() });
    return { ok: r.ok, data: await r.json() };
  };

  let out = await createSession(true);
  if (!out.ok && /submit_type/i.test(String(out.data && out.data.error && out.data.error.message))) {
    // Version d'API du compte trop ancienne pour ce réglage en abonnement : on crée la session sans lui.
    out = await createSession(false);
  }
  if (!out.ok) {
    console.error('Stripe error:', out.data);
    return res.status(500).json({ error: 'Le paiement est momentanément indisponible. Réessaie dans un instant.' });
  }
  return res.status(200).json({ url: out.data.url });
}
