// Lecture des fichiers Word, PowerPoint et LibreOffice directement dans le navigateur (aucun envoi, aucun service tiers).
// Ces fichiers sont des archives ZIP contenant du XML : on décompresse avec l'outil natif du navigateur (DecompressionStream).
(function () {
  function u16(d, o) { return d[o] | (d[o + 1] << 8); }
  function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }

  function listZip(buf) {
    var d = new Uint8Array(buf), eocd = -1;
    for (var i = d.length - 22; i >= Math.max(0, d.length - 66000); i--) { if (u32(d, i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error('zip');
    var n = u16(d, eocd + 10), off = u32(d, eocd + 16), files = {}, dec = new TextDecoder();
    for (var k = 0; k < n; k++) {
      if (u32(d, off) !== 0x02014b50) break;
      var method = u16(d, off + 10), csize = u32(d, off + 20), nlen = u16(d, off + 28), xlen = u16(d, off + 30), clen = u16(d, off + 32), loc = u32(d, off + 42);
      var name = dec.decode(d.subarray(off + 46, off + 46 + nlen));
      files[name] = { method: method, csize: csize, loc: loc };
      off += 46 + nlen + xlen + clen;
    }
    return { d: d, files: files };
  }

  async function readEntry(z, name) {
    var f = z.files[name]; if (!f) return null;
    var d = z.d, lo = f.loc;
    if (u32(d, lo) !== 0x04034b50) throw new Error('zip');
    var start = lo + 30 + u16(d, lo + 26) + u16(d, lo + 28);
    var raw = d.subarray(start, start + f.csize);
    if (f.method === 0) return new TextDecoder().decode(raw);
    if (f.method !== 8) throw new Error('zip');
    var stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(stream).text();
  }

  function xml(s) { return new DOMParser().parseFromString(s, 'application/xml'); }
  function byTag(node, tag) { return Array.prototype.slice.call(node.getElementsByTagName(tag)); }
  function clean(t) { return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }

  function wordText(doc) {
    var out = [];
    byTag(doc, 'w:p').forEach(function (p) {
      var line = '';
      Array.prototype.forEach.call(p.getElementsByTagName('*'), function (n) {
        if (n.nodeName === 'w:t') line += n.textContent;
        else if (n.nodeName === 'w:tab') line += '\t';
        else if (n.nodeName === 'w:br' || n.nodeName === 'w:cr') line += '\n';
      });
      var st = p.getElementsByTagName('w:pStyle')[0], style = st ? (st.getAttribute('w:val') || '') : '';
      if (line.trim() && /^(heading|titre|title)/i.test(style)) line = '\n' + line.trim().toUpperCase();
      out.push(line);
    });
    return out.join('\n');
  }

  function slideText(doc) {
    return byTag(doc, 'a:p').map(function (p) { return byTag(p, 'a:t').map(function (t) { return t.textContent; }).join(''); })
      .filter(function (l) { return l.trim(); }).join('\n');
  }

  function odfText(doc) {
    var out = [];
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue;
        if (c.nodeName === 'text:p' || c.nodeName === 'text:h') {
          var t = '';
          (function inner(m) {
            for (var x = m.firstChild; x; x = x.nextSibling) {
              if (x.nodeType === 3) t += x.nodeValue;
              else if (x.nodeName === 'text:s') t += ' ';
              else if (x.nodeName === 'text:tab') t += '\t';
              else if (x.nodeName === 'text:line-break') t += '\n';
              else if (x.nodeType === 1) inner(x);
            }
          })(c);
          out.push(c.nodeName === 'text:h' && t.trim() ? '\n' + t.trim().toUpperCase() : t);
        } else walk(c);
      }
    })(doc.documentElement);
    return out.join('\n');
  }

  // Renvoie {text, pages, kind} ; pages = nombre de diapositives pour un diaporama.
  window.FicheOffice = {
    supported: function () { return typeof DecompressionStream !== 'undefined'; },
    read: async function (buf, ext) {
      var z = listZip(buf);
      if (ext === 'docx') {
        var parts = ['word/document.xml'];
        Object.keys(z.files).forEach(function (n) { if (/^word\/(footnotes|endnotes)\.xml$/.test(n)) parts.push(n); });
        var txt = '';
        for (var i = 0; i < parts.length; i++) { var s = await readEntry(z, parts[i]); if (s) txt += wordText(xml(s)) + '\n'; }
        return { text: clean(txt), kind: 'Word' };
      }
      if (ext === 'pptx') {
        var slides = Object.keys(z.files).filter(function (n) { return /^ppt\/slides\/slide\d+\.xml$/.test(n); })
          .sort(function (a, b) { return parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10); });
        var out = [];
        for (var j = 0; j < slides.length; j++) {
          var sx = await readEntry(z, slides[j]); var body = sx ? slideText(xml(sx)) : '';
          var notes = await readEntry(z, 'ppt/notesSlides/notesSlide' + slides[j].match(/\d+/)[0] + '.xml');
          var nt = notes ? slideText(xml(notes)).split('\n').filter(function (l) { return !/^\d+$/.test(l.trim()); }).join('\n') : '';
          if (body || nt) out.push('Diapositive ' + (j + 1) + '\n' + body + (nt ? '\nNotes : ' + nt : ''));
        }
        return { text: clean(out.join('\n\n')), pages: slides.length, kind: 'PowerPoint' };
      }
      if (ext === 'odt' || ext === 'odp') {
        var c = await readEntry(z, 'content.xml');
        return { text: clean(c ? odfText(xml(c)) : ''), kind: ext === 'odt' ? 'Writer' : 'Impress' };
      }
      throw new Error('format');
    }
  };
})();
