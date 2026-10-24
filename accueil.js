/* FicheAI — page d'accueil.
   1. Animations au défilement : chaque scène reçoit son avancement (de 0 à 1) et place ses éléments.
      Le défilement est lissé (légère inertie) pour que la page avance comme une vidéo.
      Rien ne tourne quand la page est immobile, et tout est désactivé si l'élève a demandé moins d'animations.
   2. Tarifs (mensuel ou annuel), FAQ, menu mobile, état du compte. */
(function () {
  'use strict';
  var H = document.documentElement;
  var ANIM = H.classList.contains('anim');
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function seg(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }            // avancement de 0 à 1 entre a et b
  function eo(t) { return 1 - Math.pow(1 - t, 3); }                             // décélération douce
  function eio(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function bell(p, a, b, c, d) { return Math.min(seg(p, a, b), 1 - seg(p, c, d)); } // apparaît puis disparaît
  function r1(n) { return Math.round(n * 10) / 10; }
  function r3(n) { return Math.round(n * 1000) / 1000; }
  function rnd(i) { var x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; }
  // Écritures de style seulement quand la valeur change (le navigateur travaille le moins possible)
  function T(el, v) { if (el && el._t !== v) { el.style.transform = v; el._t = v; } }
  function O(el, v) { if (!el) return; v = r3(v); if (el._o !== v) { el.style.opacity = v; el._o = v; } }
  function P(el, k, v) { if (!el) return; var c = el._p || (el._p = {}); if (c[k] !== v) { el.style.setProperty(k, v); c[k] = v; } }
  function C(el, c, on) { if (!el) return; var m = el._c || (el._c = {}); if (m[c] !== on) { el.classList.toggle(c, on); m[c] = on; } }
  function D(el, v) { if (el && el._d !== v) { el.style.display = v; el._d = v; } }
  function VIS(el, on) { if (el && el._vis !== on) { el.style.visibility = on ? 'visible' : 'hidden'; el._vis = on; } }
  function DASH(el, v) { v = r3(v); if (el._da !== v) { el.style.strokeDashoffset = v; el._da = v; } }
  function tr(x, y, extra) { return 'translate3d(' + r1(x) + 'px,' + r1(y) + 'px,0)' + (extra || ''); }
  function docTop(n) { var y = 0; while (n) { y += n.offsetTop; n = n.offsetParent; } return y; }
  // Découpe un texte en mots (<span class="w">), en gardant les espaces et le gras
  function words(root) {
    var out = [];
    if (!root) return out;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.nodeValue.split(/(\s+)/).forEach(function (t) {
            if (!t) return;
            if (/^\s+$/.test(t)) { frag.appendChild(document.createTextNode(t)); return; }
            var s = document.createElement('span'); s.className = 'w'; s.textContent = t; frag.appendChild(s); out.push(s);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) walk(n);
      });
    })(root);
    return out;
  }

  var vw = innerWidth, vh = innerHeight, pinH = vh, docH = 1, navH = 64;
  var target = window.scrollY || 0, cur = target;
  var scenes = [];
  function scene(o) { o.lp = -1; o.top = 0; o.h = 1; o.pinned = false; scenes.push(o); return o; }
  function scrollToP(s, p) { window.scrollTo({ top: Math.round(s.top + p * (s.h - pinH)), behavior: 'smooth' }); }
  function pillMover(pill, getX) {
    return function (f) {
      var x = getX(); if (!x.length) return;
      var i = Math.floor(f), j = Math.min(i + 1, x.length - 1), g = f - i, a = x[i] || x[0], b = x[j] || a;
      T(pill, 'translate3d(' + r1(lerp(a[0], b[0], g)) + 'px,0,0)');
      var w = r1(lerp(a[1], b[1], g)) + 'px';
      if (pill._w !== w) { pill.style.width = w; pill._w = w; }
    };
  }

  /* ═══ Ouverture : FicheAI s'ouvre comme un écran, puis les formats défilent ═══ */
  (function () {
    var el = $('#top'); if (!el) return;
    var pin = el.firstElementChild, copy = $('.hero-copy', el), wrap = $('.win-wrap', el), win = $('.win', el), glow = $('.hero-glow', el);
    var tabs = $$('.tab', el), panels = $$('.panel', el), pill = $('.tab-pill', el);
    var fiche = $$('.panel-fiche > *', el), quiz = $('.panel-quiz', el), flash = $('.fl-card', el);
    var paths = $$('.mm-links path', el), nodes = $$('.mm-c, .mm-n', el);
    var tabX = [], endY = 0, shown = 0;
    var pillAt = pillMover(pill, function () { return tabX; });
    function setTab(i) {
      tabs.forEach(function (t, k) { C(t, 'on', k === i); if (t._sel !== (k === i)) { t.setAttribute('aria-selected', k === i ? 'true' : 'false'); t._sel = (k === i); } });
    }
    function showStatic(i) { shown = i; setTab(i); panels.forEach(function (p, k) { C(p, 'on', k === i); }); pillAt(i); }
    var S = scene({
      el: el,
      measure: function () {
        tabX = tabs.map(function (t) { return [t.offsetLeft, t.offsetWidth]; });
        // Arrivée : la fenêtre se centre dans l'espace sous la barre de navigation
        endY = (navH + (pin.offsetHeight - navH - wrap.offsetHeight) / 2) - wrap.offsetTop;
        if (!ANIM) showStatic(shown);
      },
      update: function (p) {
        var a = eio(seg(p, 0, 0.42)), c = seg(p, 0, 0.26);
        T(copy, tr(0, -c * 80, ' scale(' + r3(1 - c * 0.05) + ')'));
        O(copy, 1 - eo(c));
        T(win, 'perspective(1600px) ' + tr(0, endY * a, ' rotateX(' + r1(lerp(30, 0, a)) + 'deg) scale(' + r3(lerp(0.88, 1, a)) + ')'));
        O(glow, 0.35 + 0.65 * a);
        // la fiche s'écrit pendant que l'écran s'ouvre
        fiche.forEach(function (n, i) { var t = eo(seg(p, 0.12 + i * 0.05, 0.3 + i * 0.05)); O(n, t); T(n, tr(0, (1 - t) * 12)); });
        // puis : fiche, quiz, flashcards, carte mentale
        var tp = seg(p, 0.5, 0.94) * 3, i = Math.floor(tp), f = Math.min(i + eio(seg(tp - i, 0.35, 0.65)), 3);
        pillAt(f); setTab(Math.round(f));
        panels.forEach(function (pn, k) {
          var o = clamp(1 - Math.abs(f - k) * 2, 0, 1);
          O(pn, o); T(pn, tr(0, (f - k) * -18)); VIS(pn, o > 0.002);
        });
        P(quiz, '--k', String(r3(seg(tp, 0.7, 1))));
        P(quiz, '--k2', String(r3(seg(tp, 0.85, 1.15))));
        T(flash, 'rotateY(' + r1(eio(seg(tp, 1.8, 2.15)) * 180) + 'deg)');
        paths.forEach(function (pa, k) { DASH(pa, 1 - seg(tp, 2.5 + k * 0.05, 2.85 + k * 0.05)); });
        nodes.forEach(function (n, k) { O(n, eo(seg(tp, 2.42 + k * 0.06, 2.62 + k * 0.06))); });
      }
    });
    tabs.forEach(function (t, k) {
      t.addEventListener('click', function () { if (ANIM) scrollToP(S, 0.5 + (k / 3) * 0.44); else showStatic(k); });
    });
  })();

  /* ═══ En bref : les chiffres montent ═══ */
  (function () {
    var el = $('.stats'); if (!el || !ANIM) return;
    var items = $$('.stat', el), nums = $$('[data-count]', el);
    scene({
      el: el,
      update: function (p, y) {
        var e = seg(y + vh - this.top, vh * 0.05, vh * 0.6);
        items.forEach(function (it, i) { var t = eo(seg(e, i * 0.1, 0.55 + i * 0.1)); O(it, t); T(it, tr(0, (1 - t) * 30)); });
        nums.forEach(function (n) {
          var v = Math.round(eio(seg(e, 0.05, 0.75)) * (+n.getAttribute('data-count') || 0));
          if (n._n !== v) { n.textContent = v; n._n = v; }
        });
      }
    });
  })();

  /* ═══ Comment ça marche : le cours devient une fiche ═══ */
  (function () {
    var el = $('#comment'); if (!el) return;
    var stage = $('.stage', el), sin = $('.stage-in', el), paper = $('.paper', el), pbg = $('.paper-bg', el), pfile = $('.paper-file', el);
    var pin_ = $('.paper-in', el), pt = $('.paper-t', el), plines = $('.paper-lines', el), scan = $('.scan', el);
    var chips = $$('.chip', el), sel = $('.chip-sel', el), fiche = $('.fiche', el), fbs = $$('.fb', el), toast = $('.toast', el);
    var sts = $$('.st', el), rail = $('.st-rail i', el);
    var ws = words($('.paper-p', el)), wd = [], cp = [], k = 1, ph = 480, ox = 280, oy = 280, ring = true;
    var RING = [[96, 116], [466, 90], [492, 214], [70, 248], [474, 352], [88, 384], [300, 514]];
    scene({
      el: el,
      measure: function () {
        var W0 = sin.offsetWidth, H0 = sin.offsetHeight;
        ph = paper.offsetHeight; ring = W0 > 450;
        ox = paper.offsetLeft + paper.offsetWidth / 2; oy = paper.offsetTop + ph / 2;
        if (ANIM) {
          k = Math.min(1, stage.clientWidth / W0, stage.clientHeight / H0);
        } else {
          k = Math.min(1, stage.clientWidth / W0);
          stage.style.height = Math.round((fiche.offsetTop + fiche.offsetHeight + 12) * k) + 'px';
        }
        P(sin, '--k', String(r3(k)));
        // positions naturelles (sans transformation) des mots et des blocs de la fiche
        var list = [paper, fiche].concat(fbs, ws);
        var saved = list.map(function (n) { var t = n.style.transform; n.style.transform = 'none'; return t; });
        var sr = sin.getBoundingClientRect(), pr = paper.getBoundingClientRect();
        var at = function (n) { var r = n.getBoundingClientRect(); return [(r.left - sr.left + r.width / 2) / k, (r.top - sr.top + r.height / 2) / k, (r.top - pr.top) / k]; };
        var bl = fbs.map(at);
        wd = ws.map(function (w, i) {
          var q = at(w), b = bl[Math.min(bl.length - 1, Math.floor(i / ws.length * bl.length))];
          return { el: w, ry: q[2], dx: b[0] - q[0] + rnd(i) * 70, dy: b[1] - q[1] + rnd(i + 9) * 14, r: rnd(i + 3) * 30 };
        });
        list.forEach(function (n, i) { n.style.transform = saved[i]; });
        // où se posent les formats : autour de la feuille (ordinateur) ou en liste (téléphone)
        cp = chips.map(function (ch, i) {
          var w = ch.offsetWidth, h = ch.offsetHeight, x = ring ? RING[i][0] : W0 / 2, y = ring ? RING[i][1] : 96 + i * 46;
          return [x - w / 2, y - h / 2, w, h];
        });
      },
      update: function (p) {
        var step = p < 0.34 ? 0 : p < 0.62 ? 1 : 2;
        sts.forEach(function (s, i) { C(s, 'on', i === step); });
        T(rail, 'scaleY(' + r3(seg(p, 0.02, 0.9)) + ')');
        // 1. Le cours arrive, le PDF se pose, FicheAI le lit
        var a = eo(seg(p, 0, 0.09));
        T(paper, tr(0, (1 - a) * 60, ' rotate(' + r1((1 - a) * -5) + 'deg)')); O(paper, a);
        var fi = eo(seg(p, 0.05, 0.14));
        T(pfile, tr(0, (1 - fi) * -36, ' scale(' + r3(0.9 + 0.1 * fi) + ')')); O(pfile, fi * (1 - seg(p, 0.62, 0.68)));
        var sc = seg(p, 0.13, 0.31), sy = lerp(-10, ph - 46, sc);
        O(scan, bell(p, 0.12, 0.14, 0.3, 0.33)); T(scan, tr(0, sy));
        // 2. Les formats apparaissent, la fiche de révision est choisie
        var s = eio(seg(p, 0.48, 0.55)), out = seg(p, 0.6, 0.67);
        P(sel, '--s', String(r3(s)));
        if (!ring) O(pin_, 1 - 0.8 * bell(p, 0.34, 0.4, 0.6, 0.66));
        chips.forEach(function (ch, i) {
          var t = eo(seg(p, 0.35 + i * 0.017, 0.45 + i * 0.017)), q = cp[i]; if (!q) return;
          var x = lerp(ox - q[2] / 2, q[0], t), y = lerp(oy - q[3] / 2, q[1], t);
          T(ch, tr(x, y, ' scale(' + r3(0.6 + 0.4 * t - (ch === sel ? 0 : 0.06 * s) - 0.12 * out) + ')'));
          O(ch, t * (1 - out) * (ch === sel ? 1 : 1 - 0.55 * s));
        });
        // 3. Les mots s'envolent vers la fiche, qui se construit
        var po = seg(p, 0.64, 0.76);
        O(pbg, 1 - po); O(pt, 1 - po); O(plines, 1 - po);
        wd.forEach(function (d, i) {
          C(d.el, 'lu', p < 0.62 && sc > 0 && d.ry < sy + 50);
          var t = eio(seg(p, 0.62 + i * 0.0021, 0.75 + i * 0.0021));
          if (t <= 0) { T(d.el, 'none'); O(d.el, 1); return; }
          T(d.el, tr(d.dx * t, d.dy * t, ' rotate(' + r1(d.r * t) + 'deg) scale(' + r3(1 - 0.45 * t) + ')'));
          O(d.el, 1 - seg(t, 0.5, 1));
        });
        var f = eo(seg(p, 0.69, 0.79));
        O(fiche, f); T(fiche, tr(0, (1 - f) * 20, ' scale(' + r3(0.95 + 0.05 * f) + ')'));
        fbs.forEach(function (b, i) { var t = eo(seg(p, 0.73 + i * 0.03, 0.82 + i * 0.03)); O(b, t); T(b, tr(0, (1 - t) * 14)); });
        var to = eo(seg(p, 0.91, 0.97)); O(toast, to); T(toast, 'translate3d(-50%,' + r1((1 - to) * 16) + 'px,0)');
      }
    });
  })();

  /* ═══ Formats : la fiche se démultiplie en sept formats ═══ */
  (function () {
    var el = $('#formats'); if (!el) return;
    var grid = $('.fm-grid', el);
    var info = $$('.fm', el).map(function (c, i) {
      c.style.zIndex = String(20 - i);
      return { el: c, txt: $('.fm-txt', c), top: 0, dx: 0, dy: 0, rot: 0, maps: $$('.mv-map path', c), chrono: $$('.mv-chrono span', c) };
    });
    scene({
      el: el,
      setup: function () { this.pinned = ANIM && vw >= 900 && pinH >= 680; C(el, 'flow', ANIM && !this.pinned); },
      measure: function () {
        var saved = info.map(function (d) { var t = d.el.style.transform; d.el.style.transform = 'none'; return t; });
        var g = grid.getBoundingClientRect(), gx = g.left + g.width / 2, gy = g.top + g.height / 2;
        info.forEach(function (d, i) {
          var r = d.el.getBoundingClientRect();
          d.top = docTop(d.el);
          d.dx = gx - (r.left + r.width / 2) + (i - 3) * 7;
          d.dy = gy - (r.top + r.height / 2) + (i - 3) * 5;
          d.rot = (i - 3) * 3.2;
        });
        info.forEach(function (d, i) { d.el.style.transform = saved[i]; });
      },
      update: function (p, y) {
        var pinned = this.pinned;
        info.forEach(function (d, i) {
          var q;
          if (pinned) {
            var t = eio(seg(p, 0.03 + i * 0.024, 0.46 + i * 0.024));
            T(d.el, tr(d.dx * (1 - t), d.dy * (1 - t), ' rotate(' + r1(d.rot * (1 - t)) + 'deg) scale(' + r3(0.74 + 0.26 * t) + ')'));
            O(d.el, 1); O(d.txt, seg(t, 0.6, 1));
            q = i === 0 ? 1 : seg(p, 0.48 + i * 0.035, 0.74 + i * 0.035);
          } else {
            var e = eo(seg(y + vh - d.top, vh * 0.02, vh * 0.4));
            T(d.el, tr(0, (1 - e) * 44, ' scale(' + r3(0.96 + 0.04 * e) + ')')); O(d.el, e); O(d.txt, 1);
            q = seg(y + vh - d.top, vh * 0.3, vh * 0.8);
          }
          P(d.el, '--q', String(r3(q)));
          d.maps.forEach(function (pa, k) { DASH(pa, 1 - seg(q, k * 0.12, 0.55 + k * 0.12)); });
          d.chrono.forEach(function (s, k) { C(s, 'on', q > 0.12 + k * 0.25); });
        });
      }
    });
  })();

  /* ═══ Niveau scolaire : la même notion, du collège au supérieur ═══ */
  (function () {
    var el = $('.niveau'); if (!el) return;
    var btns = $$('.seg button', el), pill = $('.seg-pill', el), txts = $$('.lv-t', el), body = $('.lv-body', el);
    var bx = [], cur_ = 0;
    var pillAt = pillMover(pill, function () { return bx; });
    function setOn(i) { btns.forEach(function (b, k) { C(b, 'on', k === i); b.setAttribute('aria-pressed', k === i ? 'true' : 'false'); }); }
    function still(i) { cur_ = i; setOn(i); txts.forEach(function (t, k) { C(t, 'on', k === i); }); pillAt(i); }
    var S = scene({
      el: el,
      measure: function () {
        bx = btns.map(function (b) { return [b.offsetLeft, b.offsetWidth]; });
        var m = 0; txts.forEach(function (t) { m = Math.max(m, t.offsetHeight); });
        if (m) body.style.height = m + 'px';
        if (!ANIM) still(cur_);
      },
      update: function (p) {
        var lv = seg(p, 0.1, 0.9) * 3, i = Math.floor(lv), f = Math.min(i + eio(seg(lv - i, 0.3, 0.7)), 3);
        pillAt(f); setOn(Math.round(f));
        txts.forEach(function (t, k) { var o = clamp(1 - Math.abs(f - k) * 2, 0, 1); O(t, o); T(t, tr(0, (f - k) * -14)); VIS(t, o > 0.002); });
      }
    });
    btns.forEach(function (b, k) { b.addEventListener('click', function () { if (ANIM) scrollToP(S, 0.1 + (k / 3) * 0.8); else still(k); }); });
  })();

  /* ═══ Chat IA : la question s'écrit, la réponse arrive mot à mot ═══ */
  (function () {
    var el = $('.chat'); if (!el || !ANIM) return;
    var mUser = $('.m-user', el), mTyp = $('.m-typing', el), mAns = $('.m-answer', el), sugs = $$('.cb-sugs span', el);
    var typed = $('.cb-typed', el), ph = $('.cb-ph', el), caret = $('.cb-caret', el), send = $('.cb-send', el);
    var msg = mUser.textContent.replace(/\s+/g, ' ').trim(), aw = words($('.m-b', mAns));
    scene({
      el: el,
      update: function (p) {
        var n = Math.round(seg(p, 0.05, 0.24) * msg.length), sent = p >= 0.26;
        var s = sent ? '' : msg.slice(0, n); if (s.length > 30) s = '…' + s.slice(-29);
        if (typed._s !== s) { typed.textContent = s; typed._s = s; }
        O(ph, n === 0 || sent ? 1 : 0); O(caret, n > 0 && !sent ? 1 : 0);
        T(send, 'scale(' + r3(1 - 0.12 * bell(p, 0.235, 0.25, 0.26, 0.28)) + ')');
        var u = eo(seg(p, 0.26, 0.31)); O(mUser, u); T(mUser, tr(0, (1 - u) * 16, ' scale(' + r3(0.96 + 0.04 * u) + ')'));
        var ty = bell(p, 0.31, 0.33, 0.41, 0.43); D(mTyp, ty > 0.002 ? 'flex' : 'none'); O(mTyp, ty);
        D(mAns, p >= 0.42 ? 'flex' : 'none'); O(mAns, eo(seg(p, 0.42, 0.45)));
        var kk = seg(p, 0.43, 0.82) * aw.length;
        aw.forEach(function (w, i) { var v = kk - i; C(w, 'h', v <= 0); if (v > 0) O(w, clamp(v, 0, 1)); });
        sugs.forEach(function (sg, i) { var t = eo(seg(p, 0.85 + i * 0.025, 0.91 + i * 0.025)); O(sg, t); T(sg, tr(0, (1 - t) * 10)); });
      }
    });
  })();

  /* ═══ Mode Révision : la carte se retourne, « Bien », l'objectif du jour est atteint ═══ */
  (function () {
    var el = $('.revision'); if (!el || !ANIM) return;
    var rv = $('.rv', el), c1 = $('.rv-c1', el), flip = $('.rv-flip', el), c2 = $('.rv-c2', el), c3 = $('.rv-c3', el);
    var reveal = $('.rv-reveal', el), rate = $('.rv-rate', el), rb = $$('.rv-btns span', el), n = $('.rv-n', el), bar = $('.rv-bar i', el);
    scene({
      el: el,
      update: function (p) {
        var ci = eo(seg(p, 0, 0.07));
        O(reveal, seg(p, 0.03, 0.07) * (1 - seg(p, 0.15, 0.19)));
        T(reveal, 'scale(' + r3(1 - 0.05 * bell(p, 0.1, 0.12, 0.13, 0.15)) + ')');
        T(flip, 'rotateY(' + r1(eio(seg(p, 0.15, 0.3)) * 180) + 'deg)');
        O(rate, seg(p, 0.27, 0.33) * (1 - seg(p, 0.52, 0.58)));
        var press = bell(p, 0.43, 0.45, 0.47, 0.5);
        rb.forEach(function (b, i) {
          var t = eo(seg(p, 0.28 + i * 0.02, 0.36 + i * 0.02));
          O(b, t); T(b, tr(0, (1 - t) * 12, i === 2 ? ' scale(' + r3(1 - 0.08 * press) + ')' : ''));
        });
        var glow = press > 0.01 ? '0 0 0 ' + r1(press * 4) + 'px rgba(162,155,254,.55)' : '';
        if (rb[2] && rb[2]._g !== glow) { rb[2].style.boxShadow = glow; rb[2]._g = glow; }
        var out = eio(seg(p, 0.5, 0.62));
        T(c1, tr(0, (1 - ci) * 30 - out * 90, ' rotate(' + r1(out * 7) + 'deg) scale(' + r3(1 - 0.08 * out) + ')'));
        O(c1, ci * (1 - seg(p, 0.54, 0.62)));
        var nx = eo(seg(p, 0.55, 0.66));
        T(c2, tr(0, lerp(9, 0, nx), ' scale(' + r3(lerp(0.95, 1, nx)) + ')'));
        T(c3, tr(0, lerp(18, 9, nx), ' scale(' + r3(lerp(0.9, 0.95, nx)) + ')'));
        var g = seg(p, 0.6, 0.72), txt = (g >= 1 ? 20 : 19) + ' / 20 cartes';
        if (n._s !== txt) { n.textContent = txt; n._s = txt; }
        T(bar, 'scaleX(' + r3(lerp(0.95, 1, eio(g))) + ')');
        C(rv, 'pending', g < 1);
      }
    });
  })();

  /* ═══ Sujets d'examen : le sujet glisse, le corrigé apparaît ═══ */
  (function () {
    var vis = $('.examen .ex'); if (!vis || !ANIM) return;
    var sub = $('.sheet-sub', vis), cor = $('.sheet-cor', vis), cls = $$('.cl', vis);
    scene({
      el: vis,
      update: function (p) {
        var e = eio(seg(p, 0.18, 0.5));
        T(sub, tr(0, lerp(26, 0, e), ' translateX(' + r1(lerp(12, 0, e)) + '%) rotate(' + r1(lerp(0, -3, e)) + 'deg)'));
        T(cor, tr(0, lerp(-24, 0, e), ' translateX(' + r1(lerp(-20, 0, e)) + '%) rotate(' + r1(lerp(-1, 4, e)) + 'deg)'));
        O(cor, seg(p, 0.16, 0.3));
        cls.forEach(function (c, i) { O(c, 0.2 + 0.8 * seg(p, 0.42 + i * 0.05, 0.5 + i * 0.05)); });
      }
    });
  })();

  /* ═══ Import PDF : les pages s'étalent, l'IA lit le schéma ═══ */
  (function () {
    var vis = $('.pdf .pdfv'); if (!vis || !ANIM) return;
    var pages = $$('.pg:not(.pg-front)', vis), front = $('.pg-front', vis), beam = $('.beam', vis), lbls = $$('.lbl', vis), chip = $('.pdf-chip', vis);
    var FAN = [], fh = 380;
    scene({
      el: vis,
      measure: function () {
        FAN = vw < 560 ? [[-62, 8, -8], [-32, 3, -4], [32, 3, 4], [62, 8, 8]] : [[-120, 8, -9], [-60, 3, -4.5], [60, 3, 4.5], [120, 8, 9]];
        fh = front.offsetHeight;
      },
      update: function (p) {
        var f = eio(seg(p, 0.16, 0.42));
        pages.forEach(function (pg, i) { var q = FAN[i]; if (q) T(pg, tr(q[0] * f, q[1] * f, ' rotate(' + r1(q[2] * f) + 'deg)')); });
        O(beam, bell(p, 0.34, 0.37, 0.58, 0.62)); T(beam, tr(0, lerp(0, fh - 60, seg(p, 0.36, 0.6))));
        lbls.forEach(function (l, i) { var t = eo(seg(p, 0.42 + i * 0.05, 0.5 + i * 0.05)); O(l, t); T(l, 'scale(' + r3(0.8 + 0.2 * t) + ')'); });
        var c = eo(seg(p, 0.56, 0.64)); O(chip, c); T(chip, 'translate3d(-50%,' + r1((1 - c) * 14) + 'px,0)');
      }
    });
  })();

  /* ═══ Et aussi : chaque tuile joue sa petite scène ═══ */
  (function () {
    var el = $('.bento'); if (!el || !ANIM) return;
    var tiles = $$('.tile', el).map(function (t) { return { el: t, top: 0 }; });
    var lang = $$('.lg span', el), epDoc = $('.ep-doc', el), epFile = $('.ep-file', el), epName = $('.ep-name', el);
    var rows = $$('.lb-r', el), fcUi = $('.fc-ui', el), fcDoc = $('.fc-doc', el), th = $('.th', el);
    var boxes = $$('.tf-boxes span', el), sh = $('.tf-sh', el), ok = $('.tf-ok', el);
    scene({
      el: el,
      measure: function () { tiles.forEach(function (t) { t.top = docTop(t.el); }); },
      update: function (p, y) {
        function e(i) { return tiles[i] ? seg(y + vh - tiles[i].top, vh * 0.12, vh * 0.85) : 1; }
        tiles.forEach(function (t) { var r = eo(seg(y + vh - t.top, 0, vh * 0.35)); T(t.el, tr(0, (1 - r) * 40)); O(t.el, r); });
        var l = e(0) * 3, li = Math.floor(l), lf = Math.min(li + eio(seg(l - li, 0.3, 0.7)), 3);
        lang.forEach(function (s, k) { var o = clamp(1 - Math.abs(lf - k) * 2, 0, 1); O(s, o); T(s, tr(0, (lf - k) * -18)); });
        var x = e(1), d = eio(seg(x, 0.15, 0.6));
        T(epDoc, tr(0, lerp(-6, 46, d), ' scale(' + r3(lerp(1, 0.5, d)) + ')')); O(epDoc, 1 - seg(x, 0.52, 0.62));
        T(epFile, 'scale(' + r3(1 + 0.1 * bell(x, 0.55, 0.62, 0.66, 0.76)) + ')'); O(epName, seg(x, 0.6, 0.75));
        var b = e(2); rows.forEach(function (r, k) { var t = eo(seg(b, 0.1 + k * 0.12, 0.4 + k * 0.12)); O(r, t); T(r, tr((1 - t) * 26, 0)); });
        var c = eio(seg(e(3), 0.2, 0.65)); O(fcUi, 1 - c); T(fcDoc, 'scale(' + r3(lerp(0.8, 1.08, c)) + ')');
        C(th, 'light', e(4) > 0.45);
        var f = e(5), nb = Math.floor(seg(f, 0.12, 0.6) * 6 + 1e-6);
        boxes.forEach(function (bx, k) { C(bx, 'e', k >= nb); C(bx, 'f', k < nb); });
        T(sh, tr(0, lerp(-4, 0, eo(seg(f, 0.62, 0.7))))); O(ok, seg(f, 0.68, 0.78));
      }
    });
  })();

  /* ═══ Engagements : les icônes se dessinent ═══ */
  (function () {
    var el = $('.eng'); if (!el || !ANIM) return;
    var items = $$('.eg', el).map(function (a) { return { el: a, top: 0, parts: $$('.eg-ic *', a) }; });
    scene({
      el: el,
      measure: function () { items.forEach(function (d) { d.top = docTop(d.el); }); },
      update: function (p, y) {
        items.forEach(function (d) {
          var e = seg(y + vh - d.top, vh * 0.05, vh * 0.6), r = eo(seg(e, 0, 0.6));
          T(d.el, tr(0, (1 - r) * 30)); O(d.el, r);
          d.parts.forEach(function (pa, k) { DASH(pa, 1 - eio(seg(e, 0.15 + k * 0.12, 0.65 + k * 0.12))); });
        });
      }
    });
  })();

  /* ═══ Tarifs : les formules montent l'une après l'autre ═══ */
  (function () {
    var el = $('.price-grid'); if (!el || !ANIM) return;
    var w = $$('.pc-wrap', el).map(function (n) { return { el: n, top: 0 }; });
    scene({
      el: el,
      measure: function () { w.forEach(function (d) { d.top = docTop(d.el); }); },
      update: function (p, y) {
        w.forEach(function (d, i) {
          var e = eo(seg(y + vh - d.top, vh * (0.02 + i * 0.04), vh * (0.42 + i * 0.04)));
          T(d.el, tr(0, (1 - e) * 70, ' scale(' + r3(0.96 + 0.04 * e) + ')')); O(d.el, 0.15 + 0.85 * e);
        });
      }
    });
  })();

  /* ═══ Fin : les trois couches du logo se rassemblent ═══ */
  (function () {
    var el = $('.final'); if (!el || !ANIM) return;
    var mk = $$('.mk', el), t = $('.final-t', el);
    scene({
      el: el,
      update: function (p, y) {
        var c = eio(seg(y + vh - this.top, vh * 0.1, vh * 0.75));
        T(mk[0], tr(0, lerp(-7, 0, c))); T(mk[2], tr(0, lerp(7, 0, c)));
        O(mk[0], 0.3 + 0.7 * c); O(mk[2], 0.3 + 0.7 * c);
        T(t, 'scale(' + r3(lerp(0.93, 1, c)) + ')'); O(t, 0.2 + 0.8 * c);
      }
    });
  })();

  /* ═══ Moteur ═══ */
  var prog = $('.nav-progress');
  function render(y) {
    if (prog) T(prog, 'scaleX(' + r3(clamp(y / Math.max(1, docH - vh), 0, 1)) + ')');
    for (var i = 0; i < scenes.length; i++) {
      var s = scenes[i], p;
      if (!s.update) continue;
      if (s.pinned) p = clamp((y - s.top) / Math.max(1, s.h - pinH), 0, 1);
      else p = clamp((y + vh - s.top) / (vh + s.h), 0, 1);
      if (p === s.lp) continue;
      s.lp = p;
      try { s.update(p, y); } catch (err) { s.update = null; if (window.console) console.warn('FicheAI animation', err); }
    }
  }
  function measureAll() {
    vw = innerWidth; vh = innerHeight;
    var nav = $('nav'); navH = nav ? nav.getBoundingClientRect().bottom : 64;
    var pin = $('.scene > .pin'); pinH = ANIM && pin ? pin.offsetHeight : vh;
    scenes.forEach(function (s) { if (s.setup) s.setup(); else s.pinned = ANIM && s.el.classList.contains('scene'); });
    scenes.forEach(function (s) {
      s.top = docTop(s.el); s.h = s.el.offsetHeight; s.lp = -1;
      try { if (s.measure) s.measure(); } catch (err) { if (window.console) console.warn('FicheAI mesure', err); }
    });
    docH = H.scrollHeight;
    if (ANIM) render(cur);
  }
  var last = 0, raf = 0;
  function tick(now) {
    raf = 0;
    var dt = last ? Math.min(64, now - last) : 16.7; last = now;
    var d = target - cur;
    // Grand saut (lien vers une section, retour en arrière) : on suit tout de suite
    if (Math.abs(d) > vh * 2.5) cur = target;
    else cur += d * (1 - Math.pow(1 - K, dt / 16.7));
    if (Math.abs(target - cur) < 0.5) cur = target;
    render(cur);
    if (cur !== target) raf = requestAnimationFrame(tick); else last = 0;
  }
  var K = 0.14;
  try { if (matchMedia('(pointer: coarse)').matches) K = 0.32; } catch (e) {}
  function kick() { target = window.scrollY || 0; if (!raf) raf = requestAnimationFrame(tick); }

  var rt = 0, lastW = vw, lastH = vh;
  function later(ms) { clearTimeout(rt); rt = setTimeout(measureAll, ms); }
  addEventListener('resize', function () {
    // La barre d'adresse des téléphones change un peu la hauteur en défilant : on l'ignore
    if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 140) return;
    lastW = innerWidth; lastH = innerHeight; later(120);
  });
  if (window.ResizeObserver) {
    var lastBH = 0;
    try { new ResizeObserver(function () { var bh = document.body.offsetHeight; if (Math.abs(bh - lastBH) > 2) { lastBH = bh; later(80); } }).observe(document.body); } catch (e) {}
  }
  addEventListener('load', function () { later(0); });
  addEventListener('pageshow', function (e) { if (e.persisted) later(0); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { later(0); });
  try {
    measureAll();
    if (ANIM) { addEventListener('scroll', kick, { passive: true }); kick(); }
  } catch (err) {
    // En cas de problème, la page reste lisible : chaque scène s'affiche dans son état final
    H.classList.remove('anim'); if (window.console) console.warn('FicheAI', err);
  }

  /* ═══ Menu mobile ═══ */
  window.toggleMenu = function () {
    var m = $('#mobile-menu'), b = $('#hamburger-btn'); if (!m) return;
    var o = m.classList.toggle('open'); if (b) b.setAttribute('aria-expanded', o ? 'true' : 'false');
  };
  window.closeMenu = function () {
    var m = $('#mobile-menu'), b = $('#hamburger-btn'); if (m) m.classList.remove('open'); if (b) b.setAttribute('aria-expanded', 'false');
  };

  /* ═══ FAQ ═══ */
  window.toggleFaq = function (btn) {
    var item = btn.parentElement, open = !item.classList.contains('open');
    $$('.faq-item').forEach(function (i) { i.classList.remove('open'); var q = $('.faq-q', i); if (q) q.setAttribute('aria-expanded', 'false'); });
    if (open) { item.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
  };

  /* ═══ Tarifs : mensuel ou annuel ═══ */
  var PRO_MONTHLY = 7.99, PRO_YEARLY = 79.90; // Doivent être identiques aux prix Stripe (price pro_monthly / pro_yearly)
  window.proBilling = 'yearly';
  function fmtEur(n) { return n.toFixed(2).replace('.', ','); }
  function placeBillPill() {
    var pill = $('.bill-pill'), on = $('.bill-toggle button.on'); if (!pill || !on) return;
    pill.style.width = on.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + (on.offsetLeft - 4) + 'px)';
  }
  window.setProBilling = function (b) {
    window.proBilling = b;
    var save = Math.round((1 - PRO_YEARLY / (PRO_MONTHLY * 12)) * 100), yearly = b === 'yearly';
    // Annuel : l'équivalent mensuel en grand (comparable aux autres formules), le montant réellement prélevé juste dessous, bien visible.
    $('#pro-price-num').textContent = fmtEur(yearly ? PRO_YEARLY / 12 : PRO_MONTHLY);
    var per = $('#pro-price-per');
    per.textContent = yearly ? fmtEur(PRO_YEARLY) + ' € payés une fois par an' : 'Sans engagement';
    per.classList.toggle('strong', yearly);
    $('#pro-save-badge').textContent = '-' + save + '%';
    $('#pro-price-note').textContent = yearly
      ? Math.round(PRO_MONTHLY * 12 - PRO_YEARLY) + ' € économisés par rapport au mensuel'
      : '7 jours d\'essai gratuit pour un premier abonnement';
    var ulti = $('.plan-ultimate .price-note');
    if (ulti) ulti.textContent = yearly ? '0,06 € le crédit, sans t\'engager sur un an' : '0,06 € le crédit : 17 % moins cher qu\'en Pro';
    var c = $('#pro-cta'); if (c && !c.disabled) c.textContent = yearly ? 'S\'abonner à l\'année' : 'Essayer 7 jours gratuits';
    ['monthly', 'yearly'].forEach(function (k) {
      var el = $('#pro-btn-' + k); if (!el) return;
      el.classList.toggle('on', k === b); el.setAttribute('aria-pressed', k === b ? 'true' : 'false');
    });
    placeBillPill();
  };
  addEventListener('resize', placeBillPill);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeBillPill);

  window.handlePlanClick = async function (plan, billing) {
    var userData = null;
    try { userData = JSON.parse(localStorage.getItem('ficheai_user')); } catch (e) {}
    if (!userData || !userData.email) { window.location.href = '/signup.html?plan=' + plan + '&billing=' + billing; return; }
    // Récapitulatif de commande (checkout.js) : prix, durée, résiliation, rétractation, CGV, puis paiement Stripe.
    var key = plan === 'pro' ? (billing === 'yearly' ? 'pro_yearly' : 'pro_monthly') : 'ultimate_monthly';
    if (window.ficheaiBuy) window.ficheaiBuy(key);
  };

  /* ═══ Affichage selon l'état de connexion et le plan réel (lu en base) ═══ */
  var PLAN_RANK = { starter: 0, pro: 1, ultimate: 2 };
  function setCta(id, text, disabled) {
    var el = document.getElementById(id); if (!el) return;
    el.textContent = text; el.disabled = !!disabled;
    el.style.opacity = disabled ? '0.55' : ''; el.style.cursor = disabled ? 'not-allowed' : 'pointer';
    if (disabled) el.removeAttribute('onclick');
  }
  async function initAccountState() {
    var u = null; try { u = JSON.parse(localStorage.getItem('ficheai_user')); } catch (e) {}
    if (!u || !u.email) return;
    var login = $('#nav-login'), signup = $('#nav-signup');
    if (login) { login.textContent = 'Mon espace'; login.href = '/dashboard.html'; }
    if (signup) { signup.textContent = 'Ouvrir FicheAI'; signup.href = '/home.html'; }
    $$('a[href="/login.html"]').forEach(function (a) { if (a.id !== 'nav-login') { a.textContent = 'Mon espace'; a.href = '/dashboard.html'; } });
    var plan = u.plan || 'starter';
    try {
      var t = window.ficheaiToken ? await window.ficheaiToken() : null;
      if (t) {
        var r = await fetch('https://qyjqtjrqnlbgtxvnjvnk.supabase.co/rest/v1/users?email=eq.' + encodeURIComponent(u.email) + '&select=plan',
          { headers: { apikey: 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ', Authorization: 'Bearer ' + t } });
        var d = await r.json(); if (Array.isArray(d) && d[0] && d[0].plan) plan = d[0].plan;
      }
    } catch (e) {}
    var rank = PLAN_RANK[plan] || 0;
    if (rank >= 1) setCta('pro-cta', '✓ Ton plan actuel' + (rank === 1 ? '' : ' (inclus dans Ultimate)'), true);
    if (rank >= 2) setCta('ultimate-cta', '✓ Ton plan actuel', true);
    else if (rank === 1) setCta('ultimate-cta', 'Passer à Ultimate', false);
  }
  window.setProBilling('yearly');
  initAccountState();
})();
