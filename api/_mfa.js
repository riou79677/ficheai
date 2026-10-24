// Double authentification : un compte qui a activé la 2FA ne peut utiliser l'API
// qu'avec une session validée par le code de son application (niveau « aal2 » dans le jeton).
// Le jeton a déjà été vérifié par Supabase (/auth/v1/user) avant l'appel à ces fonctions :
// on peut donc lire ses informations sans revérifier la signature.

export function jwtClaims(token) {
  try {
    const part = String(token || '').split('.')[1] || '';
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) || {};
  } catch (e) {
    return {};
  }
}

export function hasVerifiedFactor(user) {
  return Array.isArray(user && user.factors) && user.factors.some(f => f && f.status === 'verified');
}

// Vrai si le compte a la 2FA mais que cette session n'a pas encore été validée par le code.
export function mfaMissing(token, user) {
  return hasVerifiedFactor(user) && jwtClaims(token).aal !== 'aal2';
}

export const MFA_REQUIRED = {
  error: 'Confirme ta connexion avec le code de ton application d\'authentification.',
  reason: 'mfa_required'
};
