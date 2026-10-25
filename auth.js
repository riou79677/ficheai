// Aide d'authentification partagée par toutes les pages.
// ficheaiToken() renvoie toujours un jeton de connexion valide : il est renouvelé automatiquement
// avant son expiration (1 h) grâce au refresh_token enregistré à la connexion.
(function () {
  var SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';
  var pending = null;

  function readUser() { try { return JSON.parse(localStorage.getItem('ficheai_user') || 'null'); } catch (e) { return null; } }
  function jwtExp(token) {
    try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp || 0; } catch (e) { return 0; }
  }

  window.ficheaiToken = async function () {
    var u = readUser();
    if (!u || !u.access_token) return null;
    var now = Math.floor(Date.now() / 1000);
    var exp = u.expires_at || jwtExp(u.access_token);
    if (!exp || exp - 60 > now) return u.access_token;      // encore valide (ou durée inconnue)
    if (!u.refresh_token) return u.access_token;            // ancienne session sans refresh_token : on tente quand même
    if (!pending) {
      pending = (async function () {
        try {
          var r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
            body: JSON.stringify({ refresh_token: u.refresh_token })
          });
          var d = await r.json();
          if (!r.ok || !d.access_token) return null;
          var cur = readUser() || {};
          cur.access_token = d.access_token;
          cur.refresh_token = d.refresh_token || cur.refresh_token;
          cur.expires_at = d.expires_at || (Math.floor(Date.now() / 1000) + (d.expires_in || 3600));
          localStorage.setItem('ficheai_user', JSON.stringify(cur));
          return d.access_token;
        } catch (e) { return null; } finally { pending = null; }
      })();
    }
    return await pending;
  };
  // Déconnexion : la session est aussi fermée côté serveur. Sans ça, chaque reconnexion
  // ajoutait une nouvelle ligne dans « Appareils connectés » alors que l'ancienne restait ouverte.
  window.ficheaiLogout = function (redirect) {
    var u = readUser();
    var done = function () {
      try { localStorage.removeItem('ficheai_user'); sessionStorage.removeItem('ficheai_mfa_check'); } catch (e) {}
      location.href = redirect || '/';
    };
    if (!u || !u.access_token) { done(); return; }
    var t = setTimeout(done, 2500); // on ne bloque jamais l'élève si le réseau ne répond pas
    fetch(SUPABASE_URL + '/auth/v1/logout?scope=local', { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + u.access_token }, keepalive: true })
      .catch(function () {}).then(function () { clearTimeout(t); done(); });
  };

  // Double authentification : si le compte a activé la 2FA mais que cette session n'a pas encore
  // été validée par le code (par exemple sur un autre appareil), on renvoie vers la saisie du code.
  function goMfa() {
    if (location.pathname === '/login.html') return;
    location.replace('/login.html?mfa=1&next=' + encodeURIComponent(location.pathname + location.search + location.hash));
  }
  window.ficheaiGoMfa = goMfa;
  // Promesse résolue à true quand la session est utilisable (pas de 2FA, ou 2FA déjà validée).
  var mfaReady = (function () {
    var pages = ['/home.html', '/app.html', '/dashboard.html', '/revision.html', '/settings.html', '/onboarding.html'];
    if (pages.indexOf(location.pathname) === -1) return Promise.resolve(true);
    var u = readUser();
    if (!u || !u.access_token) return Promise.resolve(true);
    var aal = '';
    try { aal = JSON.parse(atob(u.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).aal || ''; } catch (e) {}
    if (aal === 'aal2') return Promise.resolve(true);
    // Vérification au plus toutes les 10 minutes pour un compte sans 2FA.
    try {
      var c = JSON.parse(sessionStorage.getItem('ficheai_mfa_check') || 'null');
      if (c && c.email === u.email && Date.now() - c.at < 10 * 60 * 1000) return Promise.resolve(true);
    } catch (e) {}
    return window.ficheaiToken().then(function (t) {
      if (!t) return null;
      return fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + t } })
        .then(function (r) { return r.ok ? r.json() : null; });
    }).then(function (user) {
      if (!user) return true;
      var f = (user.factors || []).some(function (x) { return x && x.status === 'verified'; });
      if (f) { goMfa(); return false; }
      try { sessionStorage.setItem('ficheai_mfa_check', JSON.stringify({ email: u.email, at: Date.now() })); } catch (e) {}
      return true;
    }).catch(function () { return true; });
  })();
  // Filet de sécurité : si le serveur répond « mfa_required », on demande le code.
  (function () {
    if (!window.fetch || window.__ficheaiFetchWrapped) return;
    window.__ficheaiFetchWrapped = true;
    var orig = window.fetch;
    window.fetch = function () {
      return orig.apply(this, arguments).then(function (r) {
        if (r && (r.status === 401 || r.status === 403)) {
          try {
            r.clone().json().then(function (d) {
              if (d && (d.reason === 'mfa_required' || d.message === 'mfa_required')) goMfa();
            }).catch(function () {});
          } catch (e) {}
        }
        return r;
      });
    };
  })();

  // Session révoquée ailleurs (« Déconnecter tous les appareils », ou un seul appareil) : le jeton
  // enregistré sur cet appareil reste lisible jusqu'à 1 h, donc on interroge le serveur régulièrement
  // et on déconnecte dès que la session n'existe plus.
  (function () {
    var pages = ['/home.html', '/app.html', '/dashboard.html', '/revision.html', '/settings.html'];
    if (pages.indexOf(location.pathname) === -1) return;
    var busy = false, last = 0;
    function dead() {
      try { localStorage.removeItem('ficheai_user'); sessionStorage.removeItem('ficheai_mfa_check'); } catch (e) {}
      location.replace('/login.html?revoked=1');
    }
    async function check() {
      var u = readUser();
      if (!u || !u.access_token || busy || Date.now() - last < 3000) return;
      busy = true; last = Date.now();
      try {
        var r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + u.access_token } });
        if (r.status === 401 || r.status === 403) {
          // Jeton refusé : soit il a expiré (le refresh_token le renouvelle), soit la session est révoquée.
          var cur = readUser();
          if (!cur || cur.access_token !== u.access_token) return;   // un autre onglet vient de le renouveler
          if (!cur.refresh_token) { dead(); return; }
          var rr = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }, body: JSON.stringify({ refresh_token: cur.refresh_token }) });
          var again = readUser();
          if (!again || again.refresh_token !== cur.refresh_token) return; // renouvelé entre-temps par un autre onglet
          if (rr.ok) {
            var d = await rr.json();
            if (d && d.access_token) {
              again.access_token = d.access_token; again.refresh_token = d.refresh_token || again.refresh_token;
              again.expires_at = d.expires_at || (Math.floor(Date.now() / 1000) + (d.expires_in || 3600));
              localStorage.setItem('ficheai_user', JSON.stringify(again));
            }
          } else if (rr.status === 400 || rr.status === 401 || rr.status === 403) dead();
        }
      } catch (e) { /* réseau coupé : on ne déconnecte pas */ } finally { busy = false; }
    }
    setInterval(function () { if (!document.hidden) check(); }, 6000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
    window.addEventListener('focus', check);
    setTimeout(check, 3000);
  })();

  // Déconnexion automatique après une période d'inactivité (réglable dans Paramètres → Sécurité,
  // propre à chaque appareil : 30 min par défaut, 2 h, 8 h ou jamais).
  (function () {
    var pages = ['/home.html', '/app.html', '/dashboard.html', '/revision.html', '/settings.html'];
    if (pages.indexOf(location.pathname) === -1) return;
    var timer = null;
    function minutes() {
      var v = 30;
      try { var s = localStorage.getItem('ficheai_autologout'); if (s !== null) v = parseInt(s, 10); } catch (e) {}
      return [0, 30, 120, 480].indexOf(v) === -1 ? 30 : v;
    }
    function arm() {
      clearTimeout(timer);
      var m = minutes();
      if (!m || !readUser()) return;
      timer = setTimeout(function () {
        window.ficheaiLogout('/login.html');
      }, m * 60 * 1000);
    }
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function (ev) {
      window.addEventListener(ev, arm, { passive: true });
    });
    window.addEventListener('ficheai-prefs', arm);
    arm();
  })();

  // Configuration du compte : à la première visite d'une page de l'espace connecté,
  // on envoie l'utilisateur sur /onboarding.html tant qu'il n'a pas choisi son niveau.
  (function () {
    var pages = ['/home.html', '/app.html', '/dashboard.html', '/revision.html'];
    if (pages.indexOf(location.pathname) === -1) return;
    var u = readUser();
    if (!u || !u.email || u.onboarded) return;
    mfaReady.then(function (ok) { return ok ? window.ficheaiToken() : null; }).then(function (t) {
      if (!t) return;
      return fetch(SUPABASE_URL + '/rest/v1/user_onboarding?select=user_id', {
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + t }
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (!Array.isArray(d)) return;
        if (d.length > 0) {
          var cur = readUser() || {}; cur.onboarded = true;
          try { localStorage.setItem('ficheai_user', JSON.stringify(cur)); } catch (e) {}
          return;
        }
        location.replace('/onboarding.html?next=' + encodeURIComponent(location.pathname + location.hash));
      });
    }).catch(function () {});
  })();
})();

// Permet l'installation de FicheAI comme application sur téléphone (voir sw.js)
try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () {}); } catch (e) {}
