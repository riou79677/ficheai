// Animations de FicheAI : active les effets (classe « fa-on ») et anime les fenêtres créées à la volée,
// à l'ouverture comme à la fermeture. Rien ne s'anime si l'élève a choisi « Réduire les animations »
// ou si son appareil demande moins de mouvements.
(function () {
  var root = document.documentElement;
  function reduced() {
    try { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch (e) {}
    return root.getAttribute('data-anim') === 'reduites';
  }
  // La page d'accueil publique a déjà ses propres animations : seules les transitions entre pages s'y appliquent.
  if (location.pathname !== '/' && location.pathname !== '/index.html') root.classList.add('fa-on');

  // Fenêtres ajoutées dynamiquement (fond plein écran + boîte) : apparition en douceur.
  function isOverlay(el) {
    if (!el || el.nodeType !== 1 || el.classList.contains('fa-backdrop')) return false;
    var st = el.getAttribute('style') || '';
    if (!/position\s*:\s*fixed/.test(st) || !/inset\s*:\s*0/.test(st)) return false;
    return true;
  }
  function decorate(el) {
    el.classList.add('fa-backdrop');
    var box = el.firstElementChild;
    if (box) box.classList.add('fa-pop');
  }
  function start() {
    if (!document.body) return;
    try {
      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          m.addedNodes && m.addedNodes.forEach(function (n) { if (isOverlay(n)) decorate(n); });
        });
      }).observe(document.body, { childList: true });
    } catch (e) {}
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  // Fermeture animée : les fenêtres décorées (et le mode concentration) disparaissent en douceur.
  var origRemove = Element.prototype.remove;
  Element.prototype.remove = function () {
    var el = this;
    if (el.classList && (el.classList.contains('fa-backdrop') || el.classList.contains('fl-overlay')) && !el.__faClosing && !reduced() && el.isConnected) {
      el.__faClosing = true;
      el.classList.add('fa-closing');
      setTimeout(function () { origRemove.call(el); }, 210);
      return;
    }
    return origRemove.call(el);
  };

  // Rejoue une animation sur un élément (ex. : carte suivante en Mode Révision).
  window.FicheAnim = {
    replay: function (el, cls) {
      if (!el || reduced()) return;
      el.classList.remove(cls);
      void el.offsetWidth; // force le navigateur à repartir de zéro
      el.classList.add(cls);
    }
  };
})();
