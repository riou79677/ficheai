// Résilie immédiatement tous les abonnements Stripe encore actifs d'un client.
// Utilisé avant la suppression d'un compte : aucun prélèvement ne doit suivre un compte supprimé.
// Le client Stripe lui-même est conservé (factures à garder 10 ans).
export async function cancelAllSubscriptions(customerId, stripeKey) {
  if (!customerId) return { ok: true, canceled: 0 };
  if (!stripeKey) return { ok: false, error: 'Clé Stripe manquante' };
  const sh = { Authorization: 'Bearer ' + stripeKey };
  const r = await fetch('https://api.stripe.com/v1/subscriptions?customer=' + encodeURIComponent(customerId) + '&status=all&limit=100', { headers: sh });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: (d.error && d.error.message) || 'Lecture des abonnements impossible' };
  const live = (d.data || []).filter(s => ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'].includes(s.status));
  let canceled = 0;
  for (const s of live) {
    const c = await fetch('https://api.stripe.com/v1/subscriptions/' + s.id, { method: 'DELETE', headers: sh });
    if (!c.ok) {
      const e = await c.json().catch(() => ({}));
      return { ok: false, canceled, error: (e.error && e.error.message) || 'Résiliation impossible' };
    }
    canceled++;
  }
  return { ok: true, canceled };
}
