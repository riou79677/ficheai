// Carte mentale visuelle : transforme le texte « Mind Map » généré par l'IA en schéma en couleur,
// avec un nœud central, des branches colorées et des flèches. Sur téléphone, le schéma devient une liste colorée.
(function () {
  var PAL = ['#60a5fa', '#a29bfe', '#fbbf24', '#f87171', '#4ade80', '#fd79a8', '#22d3ee', '#fb923c'];

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clean(s) {
    return String(s).replace(/\*\*/g, '').replace(/^\[+|\]+$/g, '').replace(/^[\s:：\-–—]+/, '').replace(/\s+/g, ' ').trim();
  }
  function wrap(s, n) {
    var words = String(s).split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      if (!cur) { cur = w; return; }
      if ((cur + ' ' + w).length <= n) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines.length ? lines.slice(0, 5) : [''];
  }

  function parse(text) {
    var center = '', branches = [], cur = null;
    String(text || '').split('\n').forEach(function (raw) {
      var l = raw.replace(/[│├└─┬┤┌┐┘┴┼]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!l) return;
      var b = l.match(/^[^A-Za-zÀ-ÿ0-9]*BRANCHE\s*\d*\s*[:：\-–]?\s*(.+)$/i);
      if (b) { cur = { t: clean(b[1]), leaves: [] }; branches.push(cur); return; }
      if (!center && /🧠/.test(l)) { center = clean(l.replace(/🧠/g, '')); return; }
      if (cur && /^[→➜▸•>\-*]/.test(l)) {
        var t = clean(l.replace(/^[→➜▸•>\-*]+\s*/, ''));
        if (t) cur.leaves.push(t);
      }
    });
    if (!center) center = 'Mind map';
    branches = branches.filter(function (b) { return b.t; });
    return branches.length >= 2 ? { center: center, branches: branches } : null;
  }

  function svg(d) {
    var CX = 650, CWd = 210, LW = 260, BW = 190, GAP = 10, BGAP = 30;
    var BX = [810, 300];            // x de départ des nœuds de branche : droite, gauche
    var LX = [1040, 0];             // x de départ des feuilles : droite, gauche
    var sides = [[], []];
    d.branches.forEach(function (b, i) { sides[i % 2].push({ b: b, i: i }); });
    sides.forEach(function (side) {
      var y = 0;
      side.forEach(function (e) {
        e.lv = e.b.leaves.map(function (t) { var ln = wrap(t, 34); return { lines: ln, h: ln.length * 16 + 14 }; });
        e.bl = wrap(e.b.t, 20);
        e.bh = e.bl.length * 17 + 18;
        var lh = e.lv.length ? e.lv.reduce(function (s, x) { return s + x.h + GAP; }, -GAP) : 0;
        e.lh = lh;
        e.block = Math.max(lh, e.bh);
        e.top = y;
        y += e.block + BGAP;
      });
      side.total = Math.max(0, y - BGAP);
    });
    var H = Math.max(sides[0].total, sides[1].total, 140) + 40;
    var cy = H / 2;
    var cl = wrap(d.center, 18), ch = cl.length * 20 + 28;
    var defs = '', paths = '', nodes = '';
    PAL.forEach(function (c, i) {
      defs += '<marker id="mmA' + i + '" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto"><path d="M0 0L10 5L0 10z" fill="' + c + '"/></marker>';
    });
    sides.forEach(function (side, s) {
      var off = (H - side.total) / 2;
      side.forEach(function (e) {
        var col = PAL[e.i % PAL.length], ci = e.i % PAL.length;
        var y0 = off + e.top, by = y0 + e.block / 2;
        var bx = BX[s];
        // flèche centre -> branche
        var x1 = s === 0 ? CX + CWd / 2 : CX - CWd / 2, x2 = s === 0 ? bx : bx + BW;
        var mx = (x1 + x2) / 2;
        paths += '<path d="M' + x1 + ' ' + cy + ' C' + mx + ' ' + cy + ' ' + mx + ' ' + by + ' ' + x2 + ' ' + by + '" fill="none" stroke="' + col + '" stroke-width="3" stroke-linecap="round" marker-end="url(#mmA' + ci + ')"/>';
        // nœud de branche
        nodes += '<rect x="' + bx + '" y="' + (by - e.bh / 2) + '" width="' + BW + '" height="' + e.bh + '" rx="14" fill="' + col + '" fill-opacity=".2" stroke="' + col + '" stroke-width="2"/>';
        nodes += '<text text-anchor="middle" font-size="14" font-weight="700" fill="#fff">' + e.bl.map(function (ln, k) {
          return '<tspan x="' + (bx + BW / 2) + '" y="' + (by - e.bh / 2 + 22 + k * 17) + '">' + esc(ln) + '</tspan>';
        }).join('') + '</text>';
        // feuilles
        var ly = y0 + (e.block - e.lh) / 2;
        var fx1 = s === 0 ? bx + BW : bx, lx = LX[s], fx2 = s === 0 ? lx : lx + LW;
        e.lv.forEach(function (lf, k) {
          var cyL = ly + lf.h / 2, fm = (fx1 + fx2) / 2;
          paths += '<path d="M' + fx1 + ' ' + by + ' C' + fm + ' ' + by + ' ' + fm + ' ' + cyL + ' ' + fx2 + ' ' + cyL + '" fill="none" stroke="' + col + '" stroke-opacity=".75" stroke-width="1.8" stroke-linecap="round" marker-end="url(#mmA' + ci + ')"/>';
          nodes += '<rect x="' + lx + '" y="' + ly + '" width="' + LW + '" height="' + lf.h + '" rx="10" fill="#111120" stroke="' + col + '" stroke-opacity=".6" stroke-width="1.3"/>';
          nodes += '<text font-size="12.5" fill="#e4e3f5">' + lf.lines.map(function (ln, j) {
            return '<tspan x="' + (lx + 12) + '" y="' + (ly + 20 + j * 16) + '">' + esc(ln) + '</tspan>';
          }).join('') + '</text>';
          ly += lf.h + GAP;
        });
      });
    });
    // nœud central
    var center = '<rect x="' + (CX - CWd / 2) + '" y="' + (cy - ch / 2) + '" width="' + CWd + '" height="' + ch + '" rx="' + Math.min(34, ch / 2) + '" fill="url(#mmC)" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>';
    center += '<text text-anchor="middle" font-size="16" font-weight="800" fill="#fff">' + cl.map(function (ln, k) {
      return '<tspan x="' + CX + '" y="' + (cy - ch / 2 + 28 + k * 20) + '">' + esc(ln) + '</tspan>';
    }).join('') + '</text>';
    defs += '<linearGradient id="mmC" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6c5ce7"/><stop offset="1" stop-color="#e84393"/></linearGradient>';
    return '<svg class="mm-svg" viewBox="0 0 1300 ' + Math.round(H) + '" role="img" aria-label="Carte mentale : ' + esc(d.center) + '" xmlns="http://www.w3.org/2000/svg"><defs>' + defs + '</defs>' + paths + nodes + center + '</svg>';
  }

  function list(d) {
    return '<div class="mm-list"><div class="mm-c">' + esc(d.center) + '</div>' + d.branches.map(function (b, i) {
      var col = PAL[i % PAL.length];
      return '<div class="mm-b" style="--c:' + col + '"><div class="mm-bt">' + esc(b.t) + '</div>' +
        (b.leaves.length ? '<ul>' + b.leaves.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    }).join('') + '</div>';
  }

  function injectCss() {
    if (document.getElementById('mm-css')) return;
    var st = document.createElement('style');
    st.id = 'mm-css';
    st.textContent =
      '.mm-wrap{margin:0 0 1rem}.mm-svg{display:block;width:100%;height:auto;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:12px}' +
      '.mm-list{display:none}.mm-c{text-align:center;font-weight:800;font-size:1.05rem;color:#fff;background:linear-gradient(135deg,#6c5ce7,#e84393);border-radius:16px;padding:.8rem 1rem;margin-bottom:.9rem}' +
      '.mm-b{border-left:4px solid var(--c);background:rgba(255,255,255,.03);border-radius:0 12px 12px 0;padding:.6rem .9rem;margin-bottom:.7rem}' +
      '.mm-bt{font-weight:700;color:var(--c);margin-bottom:.3rem}.mm-b ul{margin:0;padding-left:1.1rem}.mm-b li{margin:.2rem 0;font-size:.88rem;color:#d8d7ee}' +
      '.mm-txt{margin-top:.8rem}.mm-txt summary{cursor:pointer;font-size:.82rem;color:#9898b8;padding:.3rem 0}' +
      '@media(max-width:820px){.mm-svg{display:none}.mm-list{display:block}}';
    document.head.appendChild(st);
  }

  window.FicheMindMap = {
    // Renvoie le HTML du schéma, ou '' si le texte n'a pas la structure attendue.
    render: function (text) {
      var d = parse(text);
      if (!d) return '';
      try { injectCss(); } catch (e) {}
      return '<div class="mm-wrap">' + svg(d) + list(d) + '</div>';
    }
  };
})();
