// Reconstruit le texte d'un PDF proprement : vraies lignes, paragraphes, mots coupés recollés,
// en-têtes / pieds de page répétés et numéros de page retirés. Utilisé par app.html (aucun envoi, tout se fait dans le navigateur).
(function () {
  var BULLET = /^\s*([•●▪◦○■□➢➤►▶✓✔\-–—*]|\d{1,2}[.)]|[a-zA-Z][.)]|[IVX]{1,4}[.)])\s+/;
  function median(a) { if (!a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)]; }

  // Une page : éléments de texte pdf.js → lignes { text, y, h }
  function pageLines(items) {
    var its = items.filter(function (it) { return it && typeof it.str === 'string' && it.str.length; }).map(function (it) {
      var t = it.transform || [1, 0, 0, 1, 0, 0];
      var h = Math.abs(it.height || t[3] || 10) || 10;
      return { s: it.str, x: t[4], y: t[5], w: it.width || 0, h: h };
    });
    its.sort(function (a, b) { return (b.y - a.y) || (a.x - b.x); });
    var lines = [];
    its.forEach(function (it) {
      var L = lines.length ? lines[lines.length - 1] : null;
      if (L && Math.abs(L.y - it.y) <= Math.max(2, Math.min(L.h, it.h) * 0.5)) L.items.push(it);
      else lines.push({ y: it.y, h: it.h, items: [it] });
    });
    return lines.map(function (L) {
      L.items.sort(function (a, b) { return a.x - b.x; });
      var txt = '', end = null;
      L.items.forEach(function (it) {
        if (end !== null) {
          var gap = it.x - end;
          if (gap > it.h * 0.18 && !/\s$/.test(txt) && !/^\s/.test(it.s)) txt += gap > it.h * 3 ? '   ' : ' ';
        }
        txt += it.s; end = it.x + it.w;
      });
      return { text: txt.replace(/\s+/g, ' ').trim(), y: L.y, h: median(L.items.map(function (i) { return i.h; })) };
    }).filter(function (l) { return l.text; });
  }

  function edgeLines(ls, pageH) {
    if (!ls.length) return [];
    var top = pageH || ls[0].y + 30, bodyH = median(ls.map(function (l) { return l.h; }));
    return ls.filter(function (l, i) {
      if (l.h > bodyH * 1.1) return false;                // un titre n'est jamais un en-tête
      var nearEdge = l.y > top * 0.91 || l.y < top * 0.09;  // bande du haut ou du bas de la page
      return nearEdge && (i < 2 || i >= ls.length - 2);
    });
  }
  function keyOf(t) { return t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim(); }
  function isPageNumber(t) { return /^(page\s*)?[-–(]?\s*\d{1,4}\s*([\/|]\s*\d{1,4}|sur\s*\d{1,4})?\s*[-–)]?$/i.test(t.trim()); }

  // Lignes d'une page → texte avec paragraphes
  function pageText(lines, bodyH) {
    var out = [], gaps = [];
    for (var i = 1; i < lines.length; i++) gaps.push(lines[i - 1].y - lines[i].y);
    var lineGap = median(gaps.filter(function (g) { return g > 0; })) || bodyH * 1.3;
    var fullLen = median(lines.map(function (l) { return l.text.length; }).filter(function (n) { return n > 25; })) || 80;
    lines.forEach(function (l, i) {
      var t = l.text, prev = out.length ? out[out.length - 1] : null;
      var big = l.h > bodyH * 1.18;
      var gap = i ? lines[i - 1].y - l.y : 0;
      var newPara = !prev || gap > lineGap * 1.55 || big || (i && lines[i - 1].h > bodyH * 1.18);
      if (newPara) { out.push(big ? '\n' + t : t); return; }
      var last = lines[i - 1].text;  // ligne précédente telle qu'elle est dans le PDF
      // Retour à la ligne gardé : puce, ligne précédente courte (fin de paragraphe, titre) ; sinon la phrase continue.
      var newLine = BULLET.test(t) || (last.length < fullLen * 0.8 && (/[.:;!?»)]$/.test(last) || last.length < 45)) || BULLET.test(last) && /[.:;!?]$/.test(last);
      if (newLine) { out.push('\u0001' + t); return; }
      // Même paragraphe : on recolle, en réparant les mots coupés en fin de ligne (« exem- ple » → « exemple »).
      if (/[a-zà-ÿ]-$/i.test(prev) && /^[a-zà-ÿ]/.test(t)) out[out.length - 1] = prev.slice(0, -1) + t;
      else out[out.length - 1] = prev + ' ' + t;
    });
    // \u0001 = simple retour à la ligne ; entrée séparée = nouveau paragraphe
    return out.join('\n\n').replace(/\n\n\u0001/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // pages : tableau de listes d'éléments pdf.js (une liste par page)
  // pages : liste de { items, height } (éléments pdf.js d'une page et hauteur de la page) ; une simple liste d'éléments est aussi acceptée.
  window.FichePdfText = function (pages) {
    var heights = pages.map(function (p) { return (p && p.height) || 0; });
    var all = pages.map(function (p) { return pageLines(Array.isArray(p) ? p : (p.items || [])); });
    var bodyH = median([].concat.apply([], all.map(function (ls) { return ls.map(function (l) { return l.h; }); })));
    // En-têtes et pieds de page : même texte (chiffres ignorés) en haut ou en bas d'au moins la moitié des pages.
    if (all.length >= 3) {
      var count = {};
      all.forEach(function (ls) {
        var seen = {};
        edgeLines(ls, heights[all.indexOf(ls)]).forEach(function (l) { var k = keyOf(l.text); if (k && !seen[k]) { seen[k] = 1; count[k] = (count[k] || 0) + 1; } });
      });
      var rep = {};
      Object.keys(count).forEach(function (k) { if (count[k] >= Math.max(3, Math.ceil(all.length * 0.5)) && k.length < 120) rep[k] = 1; });
      all = all.map(function (ls, pi) {
        var edges = edgeLines(ls, heights[pi]);
        return ls.filter(function (l) { return !(edges.indexOf(l) !== -1 && rep[keyOf(l.text)]); });
      });
    }
    all = all.map(function (ls) {
      return ls.filter(function (l, i) { var edge = i === 0 || i === ls.length - 1; return !(edge && isPageNumber(l.text)); });
    });
    return all.map(function (ls) { return pageText(ls, bodyH || 10); }).filter(Boolean).join('\n\n');
  };
})();
