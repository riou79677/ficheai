import { rateLimit, clientIp } from './_ratelimit.js';
import { mfaMissing, MFA_REQUIRED } from './_mfa.js';
const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';

// Déclarations en ligne :
// - rétractation : fonction « Renoncer au contrat ici » (art. L221-21 du Code de la consommation, depuis le 19/06/2026) ;
// - résiliation : fonction « Résilier votre contrat » (art. L215-1-1, depuis le 01/06/2023).
// Accessibles sans compte. Chaque déclaration est enregistrée et horodatée. L'accusé de réception reprend son contenu,
// la date et l'heure : il est affiché, téléchargeable, et envoyé par e-mail dès qu'un service d'envoi est configuré
// (variables d'environnement RESEND_API_KEY et MAIL_FROM sur Vercel).

const KINDS = { retractation: 'rétractation', resiliation: 'résiliation' };
const CONTRACTS = ['Abonnement Pro mensuel', 'Abonnement Pro annuel', 'Abonnement Ultimate mensuel', 'Recharge de générations', 'Je ne sais pas'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(v, max) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function ackText(r) {
  const when = new Date(r.created_at).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'medium', timeZone: 'Europe/Paris' });
  const lines = [
    'FicheAI — Accusé de réception de ta déclaration de ' + KINDS[r.kind],
    '',
    'Déclaration reçue le ' + when + ' (heure de Paris).',
    'Numéro de la déclaration : ' + r.id,
    '',
    'Nom : ' + r.full_name,
    'Adresse e-mail du compte : ' + r.account_email,
    'Contrat concerné : ' + r.contract + (r.contract_date ? ' (souscrit le ' + r.contract_date + ')' : ''),
    'Adresse de réception de cet accusé : ' + r.ack_email,
  ];
  if (r.details) lines.push('Précisions : ' + r.details);
  lines.push('');
  if (r.kind === 'retractation') {
    lines.push('Suite : l\'abonnement est arrêté et tu es remboursé au plus tard 14 jours après cette déclaration, par le même moyen de paiement.'
      + ' Pour un abonnement dont tu as demandé l\'accès immédiat, un montant proportionnel au service déjà fourni peut être déduit (art. L221-25).'
      + ' Pendant un essai gratuit, rien n\'est prélevé.');
  } else {
    lines.push('Suite : ton abonnement ne sera pas renouvelé. Tu gardes l\'accès jusqu\'à la fin de la période déjà payée,'
      + ' puis ton compte repasse en Starter (gratuit). Tu recevras la confirmation de la date de fin de ton contrat.');
  }
  return lines.join('\n');
}

async function sendAckEmail(r) {
  const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM;
  if (!key || !from) return false;
  try {
    const text = ackText(r);
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [r.ack_email], subject: 'FicheAI — Accusé de réception de ta déclaration de ' + KINDS[r.kind], text })
    });
    return resp.ok;
  } catch (e) {
    console.error('Envoi accusé de réception:', e && e.message);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Configuration serveur incomplète' });

  const b = req.body || {};
  const kind = typeof b.kind === 'string' && Object.prototype.hasOwnProperty.call(KINDS, b.kind) ? b.kind : null;
  if (!kind) return res.status(400).json({ error: 'Type de demande invalide.' });

  const full_name = clean(b.full_name, 200);
  const account_email = clean(b.account_email, 254).toLowerCase();
  const ack_email = (clean(b.ack_email, 254) || account_email).toLowerCase();
  const contract = CONTRACTS.includes(b.contract) ? b.contract : null;
  const contract_date = clean(b.contract_date, 40) || null;
  const details = typeof b.details === 'string' ? b.details.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, 2000) || null : null;

  if (full_name.length < 2 || !EMAIL_RE.test(account_email) || !EMAIL_RE.test(ack_email) || !contract) {
    return res.status(400).json({ error: 'Indique ton nom, l\'adresse e-mail de ton compte FicheAI et le contrat concerné.' });
  }
  if (b.confirm !== true) {
    return res.status(400).json({ error: 'La déclaration doit être confirmée.' });
  }

  // Anti-abus (meilleur effort) : 10 déclarations par heure et par adresse IP.
  if (rateLimit('legal:ip:' + clientIp(req), 10, 3600 * 1000).limited) {
    return res.status(429).json({ error: 'Trop de déclarations envoyées. Réessaie dans une heure ou écris-nous via la page Contact.' });
  }

  // Si la personne est connectée avec le compte indiqué, la demande est marquée comme vérifiée.
  let user_verified = false;
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    try {
      const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';
      const a = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token } });
      if (a.ok) {
        const u = await a.json();
        user_verified = !!(u && u.email && u.email.toLowerCase() === account_email) && !mfaMissing(token, u);
      }
    } catch (e) { /* vérification facultative */ }
  }

  let row;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/legal_requests', {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ kind, full_name, account_email, contract, contract_date, ack_email, details, user_verified })
    });
    const data = await r.json();
    row = Array.isArray(data) ? data[0] : null;
    if (!r.ok || !row) {
      console.error('Enregistrement déclaration échoué:', r.status, JSON.stringify(data).slice(0, 300));
      return res.status(500).json({ error: 'La déclaration n\'a pas pu être enregistrée. Réessaie, ou écris-nous via la page Contact.' });
    }
  } catch (e) {
    console.error('Erreur déclaration:', e);
    return res.status(503).json({ error: 'Service momentanément indisponible. Réessaie dans un instant.' });
  }

  // L'accusé est envoyé par e-mail seulement à l'adresse d'un compte FicheAI existant (celle du compte, ou une autre
  // adresse si la personne est connectée) : le formulaire, accessible sans connexion, ne doit pas pouvoir servir à
  // envoyer des e-mails à n'importe qui. Dans tous les cas, l'accusé reste affiché et téléchargeable.
  let canMail = user_verified;
  if (!canMail && ack_email === account_email && process.env.RESEND_API_KEY) {
    try {
      const u = await fetch(SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(account_email) + '&select=id', { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
      const arr = await u.json();
      canMail = Array.isArray(arr) && arr.length > 0;
    } catch (e) { canMail = false; }
  }
  const email_sent = canMail ? await sendAckEmail(row) : false;
  return res.status(200).json({
    id: row.id,
    received_at: row.created_at,
    kind: row.kind,
    ack_text: ackText(row),
    email_sent
  });
}
