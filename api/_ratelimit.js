// Limitation de débit "meilleur effort" : bloque les rafales de requêtes (boucle de script, double clic
// frénétique) avant qu'elles n'atteignent l'API Anthropic. La mémoire est propre à chaque instance
// serverless : la protection principale reste le quota en base (check_and_consume_quota + plafond quotidien).
const buckets = new Map();

export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return { limited: true, retryAfter: Math.ceil((windowMs - (now - hits[0])) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) { if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k); }
  }
  return { limited: false };
}

export function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  return (xf ? String(xf).split(',')[0].trim() : '') || (req.socket && req.socket.remoteAddress) || 'unknown';
}
