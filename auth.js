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
})();
