// Budget en euros par abonné : garantit une marge supérieure à 0,50 € quel que soit l'usage.
// Le plafond (voir la fonction SQL plafond_mensuel_eur) dépend de ce que l'abonné a réellement payé, promotions comprises.
// Avant chaque appel à l'IA, on réserve le coût MAXIMAL possible de l'appel ; une fois l'appel terminé, la réservation est
// libérée et le coût réel (enregistré dans api_usage) est imputé automatiquement par un déclencheur de la base.

const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';

// Taux prudent : 1 $ = 0,95 € (le vrai taux est plus bas, ce qui ajoute une marge de sécurité).
export const USD_EUR = 0.95;
// Estimation prudente du nombre de tokens : 1 token pour 2,7 caractères (les formules et le texte accentué en consomment davantage).
const CHARS_PER_TOKEN = 2.7;

// $ par million de tokens (entrée, sortie).
export const PRICES = { 'claude-haiku-5-5': [0.10, 0.50], 'claude-sonnet-5-5': [2, 10] };

export const tokensFromChars = (chars) => Math.ceil((chars || 0) / CHARS_PER_TOKEN);

// Coût en $ d'un appel : entrée (inTok) + sortie (outTok).
export function callCostUsd(model, inTok, outTok) {
  const p = PRICES[model] || PRICES['claude-sonnet-5-5'];
  return (inTok * p[0] + outTok * p[1]) / 1e6;
}

// Réservation (en €) pour une génération : tous les appels que le serveur peut enchaîner.
//  - Approfondi (Sonnet) : appel + second essai si la réponse est vide (sortie jusqu'à 1,75 fois plus longue).
//  - Rapide (Haiku) : appel + second essai + reprise par Sonnet si la qualité est insuffisante.
export function reserveGenerationEur({ mode, inChars, outTokens, imageCount, cached }) {
  const inTok = Math.ceil((tokensFromChars(inChars) + (imageCount || 0) * 2000) * (cached ? 1.25 : 1));
  const out1 = Math.max(500, outTokens || 0);
  const out2 = Math.min(Math.round(out1 * 1.75), 9000);
  let usd;
  if (mode === 'rapide') {
    usd = callCostUsd('claude-haiku-5-5', inTok, out1) + callCostUsd('claude-haiku-5-5', inTok, out2) + callCostUsd('claude-sonnet-5-5', inTok, out1);
  } else {
    usd = callCostUsd('claude-sonnet-5-5', inTok, out1) + callCostUsd('claude-sonnet-5-5', inTok, out2);
  }
  return Math.ceil(usd * USD_EUR * 10000) / 10000;
}

// Réservation (en €) pour un seul appel.
export function reserveSingleCallEur(model, inChars, outTokens) {
  const usd = callCostUsd(model, tokensFromChars(inChars), outTokens || 0);
  return Math.ceil(usd * USD_EUR * 10000) / 10000;
}

// Libère la réservation (appelée à la fin de la requête, réussie ou non).
export async function releaseReserve(SERVICE_KEY, email, eur) {
  if (!eur || eur <= 0) return;
  try {
    await fetch(SUPABASE_URL + '/rest/v1/rpc/liberer_reserve', {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: email, p_eur: eur })
    });
  } catch (e) { console.error('Libération de réservation :', e && e.message); }
}

// Message affiché à l'élève quand son budget d'usage du mois est atteint.
export const BUDGET_MESSAGE = "Tu as atteint la limite d'utilisation de l'IA incluse dans ton forfait pour ce mois-ci. Elle se renouvelle automatiquement le mois prochain. Tu peux aussi ajouter une recharge ou passer à un forfait supérieur.";
