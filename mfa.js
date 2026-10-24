// Double authentification (2FA) : fonctions partagées par la connexion, les Paramètres,
// le panneau admin et la page de nouveau mot de passe.
// Le code à 6 chiffres vient d'une application d'authentification (Google Authenticator, etc.).
(function () {
  var URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';
  var KEY = 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';

  var wrongCodes = 0;

  function headers(token) {
    return { 'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + token };
  }

  function claims(token) {
    try { return JSON.parse(atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) || {}; } catch (e) { return {}; }
  }

  function frenchError(status, d) {
    var raw = ((d && (d.error_code || d.code || d.msg || d.message || d.error_description || d.error)) || '') + '';
    var low = raw.toLowerCase();
    if (status === 429 || low.indexOf('rate') !== -1) return 'Trop d\'essais d\'affilée. Patiente une minute puis réessaie.';
    if (low.indexOf('not_enabled') !== -1 || low.indexOf('disabled') !== -1) return 'La double authentification n\'est pas encore disponible sur FicheAI. Réessaie plus tard.';
    if (status === 401 || status === 403 || low.indexOf('jwt') !== -1) return 'Ta session a expiré. Reconnecte-toi puis réessaie.';
    if (low.indexOf('expired') !== -1) return 'Le code a expiré. Entre le nouveau code affiché dans ton application.';
    if (low.indexOf('invalid') !== -1 || low.indexOf('verification') !== -1 || status === 422 || status === 400) {
      wrongCodes++;
      // Après plusieurs refus d'affilée, la cause la plus fréquente est l'horloge du téléphone :
      // les codes sont calculés à partir de l'heure, un téléphone en retard donne des codes refusés.
      return wrongCodes >= 3
        ? 'Code encore refusé. Vérifie que la date et l\'heure de ton téléphone sont en réglage automatique (les codes en dépendent), puis entre le code affiché en ce moment.'
        : 'Code incorrect. Entre le code à 6 chiffres affiché en ce moment dans ton application : il change toutes les 30 secondes.';
    }
    return 'Une erreur est survenue. Réessaie dans quelques instants.';
  }

  async function call(method, path, token, body) {
    var r = await fetch(URL + path, { method: method, headers: headers(token), body: body ? JSON.stringify(body) : undefined });
    var d = null;
    try { d = await r.json(); } catch (e) { d = null; }
    if (!r.ok) { var err = new Error(frenchError(r.status, d)); err.status = r.status; throw err; }
    return d;
  }

  window.FicheMFA = {
    claims: claims,

    // Compte Supabase (avec la liste de ses facteurs 2FA) ; null si la session n'est plus valide.
    getUser: async function (token) {
      try {
        var r = await fetch(URL + '/auth/v1/user', { headers: headers(token) });
        if (!r.ok) return null;
        return await r.json();
      } catch (e) { return null; }
    },

    verifiedFactor: function (user) {
      var list = (user && Array.isArray(user.factors)) ? user.factors : [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].status === 'verified' && (list[i].factor_type || 'totp') === 'totp') return list[i];
      }
      return null;
    },

    // Vérifie un code et renvoie la nouvelle session (validée par la 2FA).
    verify: async function (token, factorId, code) {
      code = String(code || '').replace(/\D/g, '');
      if (code.length !== 6) { throw new Error('Le code contient 6 chiffres.'); }
      var ch = await call('POST', '/auth/v1/factors/' + factorId + '/challenge', token, {});
      var s = await call('POST', '/auth/v1/factors/' + factorId + '/verify', token, { challenge_id: ch.id, code: code });
      if (!s || !s.access_token) throw new Error('Une erreur est survenue. Réessaie dans quelques instants.');
      wrongCodes = 0;
      if (!s.expires_at) s.expires_at = Math.floor(Date.now() / 1000) + (s.expires_in || 3600);
      return s;
    },

    // Démarre l'activation : supprime les essais inachevés, puis crée un nouveau facteur.
    enroll: async function (token) {
      var user = await this.getUser(token);
      var list = (user && Array.isArray(user.factors)) ? user.factors : [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].status !== 'verified') {
          try { await call('DELETE', '/auth/v1/factors/' + list[i].id, token); } catch (e) {}
        }
      }
      var d = await call('POST', '/auth/v1/factors', token, {
        factor_type: 'totp',
        issuer: 'FicheAI',
        friendly_name: 'FicheAI ' + new Date().toISOString().slice(0, 19).replace('T', ' ')
      });
      var qr = (d && d.totp && d.totp.qr_code) || '';
      if (qr && qr.indexOf('data:') !== 0) qr = 'data:image/svg+xml;utf-8,' + encodeURIComponent(qr);
      return { id: d.id, qr: qr, secret: (d.totp && d.totp.secret) || '', uri: (d.totp && d.totp.uri) || '' };
    },

    unenroll: async function (token, factorId) {
      await call('DELETE', '/auth/v1/factors/' + factorId, token);
      return true;
    },

    // Met à jour la session enregistrée dans le navigateur avec celle validée par le code.
    storeSession: function (s) {
      var cur = null;
      try { cur = JSON.parse(localStorage.getItem('ficheai_user') || 'null'); } catch (e) {}
      if (!cur) return;
      cur.access_token = s.access_token;
      cur.refresh_token = s.refresh_token || cur.refresh_token;
      cur.expires_at = s.expires_at;
      try { localStorage.setItem('ficheai_user', JSON.stringify(cur)); } catch (e) {}
      try { sessionStorage.removeItem('ficheai_mfa_check'); } catch (e) {}
    }
  };
})();
