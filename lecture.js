// Mode concentration : affiche une fiche seule, en plein écran, sans rien autour.
// Échap ou le bouton « Quitter » pour revenir.
(function () {
  var current = null;
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function close() {
    if (!current) return;
    current.remove(); current = null;
    document.body.classList.remove('fl-open');
    document.removeEventListener('keydown', onKey);
  }
  // opts : { title, html } (contenu déjà mis en forme) ou { title, text } (texte brut)
  function open(opts) {
    close();
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'fl-overlay';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Mode concentration');
    wrap.innerHTML = '<div class="fl-bar"><div class="fl-title">' + esc(opts.title || 'Ma fiche') + '</div>'
      + '<div class="fl-actions"></div><button class="fl-close fl-quit" type="button">✕ Quitter</button></div>'
      + '<div class="fl-body">' + (opts.html != null ? opts.html : '<div class="fl-plain">' + esc(opts.text || '') + '</div>') + '</div>';
    wrap.querySelector('.fl-quit').addEventListener('click', close);
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'fl-close fl-act'; b.textContent = a.label;
      b.addEventListener('click', function () { a.onClick(b); });
      wrap.querySelector('.fl-actions').appendChild(b);
    });
    document.body.appendChild(wrap);
    document.body.classList.add('fl-open');
    document.addEventListener('keydown', onKey);
    current = wrap;
    try { wrap.querySelector('.fl-quit').focus(); } catch (e) {}
    return wrap;
  }
  window.FicheLecture = { open: open, close: close };
})();
