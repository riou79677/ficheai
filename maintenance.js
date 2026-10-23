// FicheAI — mode maintenance commun à tout le site.
// Activé depuis le panneau admin : bandeau avec compte à rebours (2 min), puis écran de blocage.
// Pages « application » : bloquées pendant la maintenance (sauf pour le compte administrateur).
// Page d'accueil, pages légales, résiliation et rétractation : bandeau seulement, elles restent ouvertes.
(function () {
  var SB = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';
  var KEY = 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';
  var path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/index';
  var LOCKED = ['/app', '/home', '/dashboard', '/revision', '/settings', '/onboarding', '/login', '/signup', '/confirmation', '/update-password'];
  var lockable = LOCKED.indexOf(path) !== -1;
  var state = null, isDev = null, banner = null, lock = null;

  function css() {
    if (document.getElementById('maint-css')) return;
    var st = document.createElement('style'); st.id = 'maint-css';
    st.textContent =
      '#maint-banner{position:fixed;left:0;right:0;bottom:0;z-index:99998;display:none;text-align:center;padding:.7rem 1rem calc(.7rem + env(safe-area-inset-bottom,0px));' +
      'background:linear-gradient(135deg,#f59e0b,#f97316);color:#1a1200;font:700 .85rem/1.4 "DM Sans",system-ui,sans-serif;box-shadow:0 -4px 20px rgba(0,0,0,.35)}' +
      '#maint-lock{position:fixed;inset:0;z-index:99999;display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;' +
      'padding:calc(2rem + env(safe-area-inset-top,0px)) 1.5rem calc(2rem + env(safe-area-inset-bottom,0px));background:#07070f;color:#f0efff;font-family:"DM Sans",system-ui,sans-serif}' +
      '#maint-lock .mi{font-size:3rem;margin-bottom:1rem}#maint-lock h2{font:800 1.6rem/1.2 "Syne","DM Sans",sans-serif;margin:0 0 .8rem}' +
      '#maint-lock p{color:#a0a0c0;font-size:.95rem;line-height:1.7;max-width:420px;margin:0 0 1.6rem}' +
      '#maint-lock a{color:#a78bfa;font-size:.85rem;text-decoration:none;border:1px solid rgba(167,139,250,.35);padding:.55rem 1.1rem;border-radius:100px}';
    document.head.appendChild(st);
  }
  function build() {
    if (banner) return;
    css();
    banner = document.createElement('div'); banner.id = 'maint-banner'; banner.setAttribute('role', 'status');
    lock = document.createElement('div'); lock.id = 'maint-lock'; lock.setAttribute('role', 'alert');
    lock.innerHTML = '<div class="mi">🛠️</div><h2>FicheAI est en maintenance</h2><p id="maint-lock-msg"></p><a href="/">Retour à l\'accueil</a>';
    document.body.appendChild(banner); document.body.appendChild(lock);
  }
  function fmt(s) { var m = Math.floor(s / 60), r = s % 60; return m > 0 ? m + ' min ' + (r < 10 ? '0' : '') + r + ' s' : r + ' s'; }

  // Le compte administrateur garde l'accès : on lit son statut avec sa propre session (la base ne renvoie que sa ligne).
  function checkDev() {
    if (isDev !== null) return Promise.resolve(isDev);
    var tokP = (window.ficheaiToken ? window.ficheaiToken() : Promise.resolve(null)).catch(function () { return null; });
    return tokP.then(function (tk) {
      var u = null; try { u = JSON.parse(localStorage.getItem('ficheai_user') || 'null'); } catch (e) {}
      tk = tk || (u && u.access_token);
      if (!tk || !u || !u.email) return (isDev = false);
      return fetch(SB + '/rest/v1/users?email=eq.' + encodeURIComponent(u.email) + '&select=is_dev', { headers: { apikey: KEY, Authorization: 'Bearer ' + tk } })
        .then(function (r) { return r.json(); })
        .then(function (d) { isDev = !!(Array.isArray(d) && d[0] && d[0].is_dev === true); window.isDevUser = isDev || window.isDevUser; return isDev; })
        .catch(function () { return (isDev = false); });
    });
  }

  function render() {
    if (!document.body) return;
    build();
    if (!state || !state.maintenance_mode) { banner.style.display = 'none'; lock.style.display = 'none'; document.documentElement.style.overflow = ''; return; }
    var startsAt = state.starts_at ? new Date(state.starts_at).getTime() : null;
    var blocked = state.hard_blocked || (startsAt !== null && Date.now() >= startsAt);
    if (!blocked) {
      var left = startsAt ? Math.max(0, Math.round((startsAt - Date.now()) / 1000)) : 0;
      banner.textContent = '🚧 Maintenance dans ' + fmt(left) + '. Termine et enregistre ce que tu es en train de faire.';
      banner.style.display = 'block'; lock.style.display = 'none'; return;
    }
    if (!lockable || isDev === true) {
      banner.textContent = isDev === true ? '🚧 Maintenance en cours (tu gardes l\'accès en tant qu\'administrateur).' : '🚧 FicheAI est en maintenance. L\'application revient très vite.';
      banner.style.display = 'block'; lock.style.display = 'none'; document.documentElement.style.overflow = ''; return;
    }
    document.getElementById('maint-lock-msg').textContent = state.message || 'On revient très vite !';
    lock.style.display = 'flex'; banner.style.display = 'none'; document.documentElement.style.overflow = 'hidden';
  }

  function refresh() {
    fetch(SB + '/rest/v1/rpc/get_maintenance_status', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        state = d || null;
        if (state && state.maintenance_mode && lockable) return checkDev().then(render);
        render();
      })
      .catch(function () {});
  }

  window.ficheaiMaintenance = function () { return state; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh); else refresh();
  setInterval(refresh, 15000);
  setInterval(render, 1000);
})();
