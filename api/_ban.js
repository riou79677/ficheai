// Message de suspension de compte : la décision doit être motivée (règlement européen sur les services
// numériques, art. 17) : motif, fondement dans les CGU, durée, et moyen de la contester.
export function banMessage(u) {
  const reason = u && typeof u.banned_reason === 'string' && u.banned_reason.trim() ? u.banned_reason.trim().slice(0, 300) : 'non-respect des conditions d\'utilisation';
  let until = '';
  if (u && u.banned_until) {
    const d = new Date(u.banned_until);
    if (!isNaN(d)) until = ' jusqu\'au ' + d.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
  }
  return 'Ton compte est suspendu' + until + '. Motif : ' + reason + '. Cette décision s\'appuie sur l\'article « Comportements interdits » des conditions générales.'
    + ' Si tu penses qu\'il s\'agit d\'une erreur, tu peux la contester en écrivant via la page Contact : ta demande sera réexaminée.';
}
