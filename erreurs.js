// FicheAI — messages d'erreur compréhensibles, en français, partout sur le site.
// ficheaiErreur(e, secours)         : transforme n'importe quelle erreur (réseau, délai, réponse illisible, texte technique) en phrase claire.
// ficheaiErreurAuth(data, status)   : traduit les erreurs renvoyées par le système de comptes (Supabase Auth).
(function () {
  if (window.ficheaiErreur) return;
  var GENERIQUE = 'Une erreur inattendue est survenue. Réessaie dans un instant. Si le problème continue, écris-nous à contact@ficheai.fr.';
  var RESEAU = 'Connexion impossible. Vérifie ta connexion internet, puis réessaie.';
  var DELAI = 'Le serveur met trop de temps à répondre. Réessaie dans un instant.';

  // Un message technique en anglais ou vide ne doit jamais être montré tel quel.
  function technique(m) {
    if (!m || m.length < 4) return true;
    if (/^(erreur|error|api error|internal server error|bad request|not found|undefined|null|\[object object\])\.?$/i.test(m.trim())) return true;
    var anglais = /\b(the|a|an|is|are|was|not|you|your|this|that|with|for|of|to|please|try|again|something|happened|failed|invalid|unexpected|cannot|could|unable|error|request|token|undefined|null|exception|denied|forbidden|timeout|network|json|fetch|status|missing|required|wrong)\b/i;
    var francais = /[éèêàùçôîâ]|\b(le|la|les|un|une|des|ton|ta|tes|est|pas|réessaie|vérifie)\b/i;
    return anglais.test(m) && !francais.test(m);
  }

  function ficheaiErreur(e, secours) {
    var m = typeof e === 'string' ? e : (e && (e.message || e.error || e.msg)) || '';
    var name = e && e.name;
    if (name === 'AbortError' || name === 'TimeoutError' || /timed? ?out|aborted/i.test(m)) return DELAI;
    if (/failed to fetch|networkerror|load failed|network request failed|err_internet|err_network|err_connection/i.test(m)) return RESEAU;
    if (name === 'SyntaxError' || /unexpected token|json/i.test(m)) return 'Le serveur a renvoyé une réponse inattendue. Réessaie dans un instant.';
    if (technique(m)) return secours || GENERIQUE;
    return m;
  }

  var CODES = {
    invalid_credentials: 'Email ou mot de passe incorrect.',
    email_not_confirmed: 'Ton adresse email n’est pas encore confirmée. Ouvre l’email de confirmation (pense aux spams), puis clique sur le lien.',
    user_already_exists: 'Un compte existe déjà avec cet email. Connecte-toi plutôt.',
    email_exists: 'Cette adresse email est déjà utilisée par un autre compte.',
    email_address_invalid: 'Adresse email invalide. Vérifie qu’elle est bien écrite.',
    validation_failed: 'Une information saisie n’est pas valide. Vérifie l’adresse email et le mot de passe.',
    same_password: 'Ton nouveau mot de passe doit être différent de l’ancien.',
    reauthentication_needed: 'Par sécurité, reconnecte-toi avant de changer ton mot de passe (déconnecte-toi puis reconnecte-toi), ou utilise « Mot de passe oublié » sur la page de connexion.',
    reauthentication_not_valid: 'Le code de vérification est incorrect ou a expiré. Recommence.',
    over_email_send_rate_limit: 'Trop d’emails envoyés en peu de temps. Attends quelques minutes, puis réessaie.',
    over_request_rate_limit: 'Trop de tentatives en peu de temps. Attends quelques minutes, puis réessaie.',
    over_sms_send_rate_limit: 'Trop de tentatives en peu de temps. Attends quelques minutes, puis réessaie.',
    otp_expired: 'Ce lien ou ce code a expiré. Demandes-en un nouveau.',
    flow_state_expired: 'Ce lien a expiré. Recommence depuis la page de connexion.',
    session_not_found: 'Ta session a expiré. Reconnecte-toi.',
    session_expired: 'Ta session a expiré. Reconnecte-toi.',
    refresh_token_not_found: 'Ta session a expiré. Reconnecte-toi.',
    bad_jwt: 'Ta session a expiré. Reconnecte-toi.',
    user_not_found: 'Aucun compte ne correspond. Vérifie l’adresse email ou crée un compte.',
    user_banned: 'Ce compte est suspendu. Écris à contact@ficheai.fr pour en savoir plus.',
    signup_disabled: 'Les inscriptions sont momentanément fermées. Réessaie plus tard.',
    email_provider_disabled: 'La connexion par email est momentanément indisponible. Réessaie plus tard.',
    mfa_verification_failed: 'Code incorrect. Vérifie le code à 6 chiffres de ton application et réessaie.',
    mfa_challenge_expired: 'Le code a expiré. Entre le nouveau code affiché par ton application.',
    insufficient_aal: 'Confirme d’abord ta connexion avec ton code de double authentification.'
  };

  function ficheaiErreurAuth(data, status) {
    data = data || {};
    var code = data.error_code || data.code_erreur || '';
    if (code === 'weak_password') {
      var raisons = (data.weak_password && data.weak_password.reasons) || [];
      var lisibles = { length: 'il est trop court (10 caractères minimum)', characters: 'il doit contenir des lettres et des chiffres', pwned: 'il apparaît dans une fuite de données connue' };
      var r = raisons.map(function (x) { return lisibles[x]; }).filter(Boolean).join(', ');
      return 'Mot de passe trop faible' + (r ? ' : ' + r : '') + '. Choisis au moins 10 caractères, avec des lettres et des chiffres.';
    }
    if (CODES[code]) return CODES[code];
    var m = data.msg || data.error_description || data.message || (typeof data.error === 'string' ? data.error : '') || '';
    if (/invalid login credentials/i.test(m)) return CODES.invalid_credentials;
    if (/email not confirmed/i.test(m)) return CODES.email_not_confirmed;
    if (/already registered|already been registered/i.test(m)) return CODES.user_already_exists;
    if (/should be different/i.test(m)) return CODES.same_password;
    if (/password should|password must|weak/i.test(m)) return 'Mot de passe trop faible. Choisis au moins 10 caractères, avec des lettres et des chiffres.';
    if (/expired|invalid.*(link|token|otp)/i.test(m)) return CODES.otp_expired;
    if (/security purposes|rate limit|too many/i.test(m) || status === 429) return CODES.over_request_rate_limit;
    if (status === 401 || status === 403) return 'Ta session a expiré. Reconnecte-toi.';
    if (status >= 500) return 'Le service de comptes est momentanément indisponible. Réessaie dans quelques minutes.';
    return ficheaiErreur(m, GENERIQUE);
  }

  window.ficheaiErreur = ficheaiErreur;
  window.ficheaiErreurAuth = ficheaiErreurAuth;
})();
