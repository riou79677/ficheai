// Grilles tarifaires de FicheAI (côté serveur). Même interrupteur que /tarifs.js (côté site) et que la ligne
// « tva_applicable » de la table parametres (côté base). Procédure complète de bascule : BASCULE_TVA.md.
//
// SANS_TVA : franchise en base de TVA (art. 293 B du CGI), tant que le chiffre d'affaires annuel reste sous le seuil.
// AVEC_TVA : prix TTC relevés pour garder la même marge minimale (Pro > 0,75 €, Ultimate > 1,00 €, recharges > 0,55 €)
// une fois la TVA de 20 % due. Les abonnés déjà inscrits gardent leur ancien prix (et leurs crédits).

export const TVA_APPLICABLE = false;

const SANS_TVA = {
  pro_monthly:      { mode: 'subscription', plan: 'pro',      price: 'price_1TXfc5JBbEVt3aRD8UpsC4Ym', label: 'Pro mensuel',      amount: '7,99 €',  period: 'mois', trialDays: 7 },
  pro_yearly:       { mode: 'subscription', plan: 'pro',      price: 'price_1UWcCwJBbEVt3aRDFqj1v4B6', label: 'Pro annuel',       amount: '83,90 €', period: 'an' },
  ultimate_monthly: { mode: 'subscription', plan: 'ultimate', price: 'price_1TXfiUJBbEVt3aRDXGVS7pAz', label: 'Ultimate mensuel', amount: '14,99 €', period: 'mois' },
  recharge_50:      { mode: 'payment', credits: 100, price: 'price_1TvvwjJBbEVt3aRDYw3CewZz', label: 'Recharge de 100 crédits', amount: '6,99 €' },
  recharge_150:     { mode: 'payment', credits: 300, price: 'price_1TvvwqJBbEVt3aRDRZXro9z5', label: 'Recharge de 300 crédits', amount: '19,99 €' },
  recharge_400:     { mode: 'payment', credits: 800, price: 'price_1TvvwxJBbEVt3aRDJN6pTiYz', label: 'Recharge de 800 crédits', amount: '49,99 €' },
};

const AVEC_TVA = {
  pro_monthly:      { mode: 'subscription', plan: 'pro',      price: 'price_1UYsuNJBbEVt3aRD9PYwbphi', label: 'Pro mensuel',      amount: '8,99 €',   period: 'mois', trialDays: 7 },
  pro_yearly:       { mode: 'subscription', plan: 'pro',      price: 'price_1UYsuNJBbEVt3aRDJnTqSAld', label: 'Pro annuel',       amount: '101,90 €', period: 'an' },
  ultimate_monthly: { mode: 'subscription', plan: 'ultimate', price: 'price_1UYsuOJBbEVt3aRDUOLW727w', label: 'Ultimate mensuel', amount: '18,99 €',  period: 'mois' },
  recharge_50:      { mode: 'payment', credits: 100, price: 'price_1UYsuPJBbEVt3aRDeCGXHtF1', label: 'Recharge de 100 crédits', amount: '7,99 €' },
  recharge_150:     { mode: 'payment', credits: 300, price: 'price_1UYsuQJBbEVt3aRDuiLU6Xyu', label: 'Recharge de 300 crédits', amount: '20,99 €' },
  recharge_400:     { mode: 'payment', credits: 800, price: 'price_1UYsuQJBbEVt3aRDvKvkYwK3', label: 'Recharge de 800 crédits', amount: '53,99 €' },
};

export const OFFERS = TVA_APPLICABLE ? AVEC_TVA : SANS_TVA;

// Mention fiscale affichée sur le paiement Stripe et les factures.
export const MENTION_TVA = TVA_APPLICABLE ? 'Prix TTC, TVA de 20 % incluse.' : 'Prix TTC, TVA non applicable (art. 293 B du CGI).';
export const PIED_FACTURE = TVA_APPLICABLE ? 'TVA de 20 % incluse.' : 'TVA non applicable, art. 293 B du CGI.';

// Part nette d'un paiement TTC (après Stripe pire cas 3,85 % et cotisations micro-BIC 23,2 % du HT).
// Identique à la fonction SQL plafond_mensuel_eur. Une recharge achetée à un prix « avec TVA » utilise toujours le coefficient avec TVA.
const PRIX_AVEC_TVA = new Set(Object.values(AVEC_TVA).map(o => o.price));
export function partNette(priceId) {
  return (TVA_APPLICABLE || PRIX_AVEC_TVA.has(priceId)) ? 0.6015 : 0.7295;
}
