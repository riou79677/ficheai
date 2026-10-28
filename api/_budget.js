// Garantie de marge (28/10/2026) : chaque crédit coûte au MAXIMUM 0,039 € d'IA, quelle que soit l'opération.
// Les tarifs en crédits (generate.js, chat.js, flashcards.js) et les plafonds de longueur des réponses sont réglés pour ça.
// Un abonné reçoit autant de crédits que son paiement en couvre (fonction SQL credits_payes) : il peut donc toujours
// utiliser tous ses crédits, et la marge reste supérieure à 0,50 € même s'il les consomme en entier.
// Le budget en euros (plafond_mensuel_eur) reste un filet de sécurité : il ne bloque jamais avant la fin des crédits.

const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';

// Coût maximal d'un crédit, en euros (même valeur que dans la base de données).
export const EUR_PER_CREDIT = 0.039;

// Réservation pour une génération offerte (0 crédit, comptes gratuits) : son coût maximal.
export const OFFERT_RESERVE_EUR = 0.15;

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

// Message de secours (ne devrait jamais s'afficher pour un abonné, puisque ses crédits sont entièrement couverts).
export const BUDGET_MESSAGE = "Tu as atteint la limite d'utilisation de l'IA incluse dans ton forfait pour ce mois-ci.";
