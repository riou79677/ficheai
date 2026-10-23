// FicheAI — messages de l'équipe à un élève (écrits depuis le panneau admin).
// À l'ouverture d'une page de l'espace connecté, les messages non lus s'affichent un par un.
(function () {
  var SB = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';
  var KEY = 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function show(list, tk) {
    if (!list.length) return;
    var m = list.shift();
    var ov = document.createElement('div');
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.style.cssText = 'position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:max(1rem,env(safe-area-inset-top,0px)) 1rem max(1rem,env(safe-area-inset-bottom,0px))';
    ov.innerHTML = '<div style="background:#0f0f1a;border:1px solid rgba(124,109,250,.4);border-radius:20px;padding:1.6rem;max-width:460px;width:100%;font-family:\'DM Sans\',system-ui,sans-serif;color:#f1f0ff;box-shadow:0 20px 60px rgba(0,0,0,.5)">'
      + '<div style="font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#a78bfa;margin-bottom:.7rem">✉️ Message de l\'équipe FicheAI</div>'
      + '<div style="font-size:.95rem;line-height:1.65;white-space:pre-wrap;word-break:break-word;max-height:55vh;overflow:auto">' + esc(m.body) + '</div>'
      + '<button type="button" style="margin-top:1.3rem;width:100%;padding:.8rem;border:none;border-radius:12px;background:linear-gradient(135deg,#7c6dfa,#f472b6);color:#fff;font-weight:700;font-size:.9rem;cursor:pointer;font-family:inherit">J\'ai lu</button></div>';
    document.body.appendChild(ov);
    ov.querySelector('button').addEventListener('click', function () {
      fetch(SB + '/rest/v1/rpc/mark_my_message_read', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: m.id }) }).catch(function () {});
      ov.remove(); show(list, tk);
    });
  }
  function run() {
    if (!window.ficheaiToken) return;
    window.ficheaiToken().then(function (tk) {
      if (!tk) return;
      return fetch(SB + '/rest/v1/user_messages?select=id,body,created_at&read_at=is.null&order=created_at.asc&limit=5', { headers: { apikey: KEY, Authorization: 'Bearer ' + tk } })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (d) { if (Array.isArray(d) && d.length) setTimeout(function () { show(d, tk); }, 800); });
    }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
