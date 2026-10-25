// Suivi des notes sur 20 pour les sujets d'examen : l'élève se note avec le corrigé,
// et FicheAI affiche l'évolution. Les notes sont enregistrées sur le compte (réglages), donc visibles sur tous ses appareils.
(function () {
  var URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';
  var KEY = 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';
  var LS = 'ficheai_notes_examen';
  var MAX = 30;
  var notes = null; // [{d:'2026-10-25', m:'Titre', n:14.5}]

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clean(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (x) { return x && typeof x.n === 'number' && x.n >= 0 && x.n <= 20 && typeof x.d === 'string'; })
      .map(function (x) { return { d: String(x.d).slice(0, 10), m: String(x.m || '').slice(0, 40), n: x.n }; }).slice(-MAX);
  }
  function readLocal() { try { return clean(JSON.parse(localStorage.getItem(LS) || '[]')); } catch (e) { return []; } }
  function writeLocal(a) { try { localStorage.setItem(LS, JSON.stringify(a)); } catch (e) {} }

  async function rpc(name, body) {
    var t = window.ficheaiToken ? await window.ficheaiToken() : null;
    if (!t) throw new Error('non connecté');
    var r = await fetch(URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + t },
      body: JSON.stringify(body || {})
    });
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }
  async function load() {
    try {
      var p = await rpc('get_my_preferences', {});
      notes = clean(p && p.notes_examen);
      writeLocal(notes);
    } catch (e) { notes = readLocal(); }
    return notes;
  }
  async function persist(arr) {
    var res = await rpc('set_my_preferences', { p_prefs: { notes_examen: arr } });
    if (!res || res.success === false) throw new Error((res && res.reason) || 'échec');
  }

  function title(text) {
    var l = String(text || '').split('\n').map(function (x) { return x.replace(/^[#\s*📝🎓📚]+/, '').replace(/\*\*/g, '').trim(); }).filter(Boolean)[0] || 'Sujet d’examen';
    return l.length > 40 ? l.slice(0, 38) + '…' : l;
  }
  function fr(d) { var p = d.split('-'); return p.length === 3 ? p[2] + '/' + p[1] : d; }
  function fmt(n) { return (Math.round(n * 10) / 10).toString().replace('.', ','); }

  function chart(a) {
    if (a.length < 2) return '';
    var W = 300, H = 80, px = 14, py = 10, n = a.length;
    var pts = a.map(function (x, i) { return [px + i * (W - 2 * px) / (n - 1), H - py - (x.n / 20) * (H - 2 * py)]; });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="ne-chart" role="img" aria-label="Évolution de tes notes sur 20">' +
      '<line x1="' + px + '" x2="' + (W - px) + '" y1="' + (H - py - (10 / 20) * (H - 2 * py)) + '" y2="' + (H - py - (10 / 20) * (H - 2 * py)) + '" stroke="rgba(255,255,255,.12)" stroke-dasharray="3 4"/>' +
      '<polyline fill="none" stroke="#a29bfe" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>' +
      pts.map(function (p) { return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.5" fill="#e84393"/>'; }).join('') + '</svg>';
  }
  function history(a) {
    if (!a.length) return '<p class="ne-hint">Ta première note apparaîtra ici, avec ta progression au fil des sujets.</p>';
    var last = a.slice(-6).reverse();
    var out = chart(a);
    if (a.length >= 2) {
      var diff = a[a.length - 1].n - a[0].n, moy = a.reduce(function (s, x) { return s + x.n; }, 0) / a.length;
      out += '<p class="ne-sum">Moyenne : <b>' + fmt(moy) + '/20</b> · Depuis ta première note : <b>' + (diff > 0 ? '+' : '') + fmt(diff) + ' point' + (Math.abs(diff) >= 2 ? 's' : '') + '</b></p>';
    }
    out += '<ul class="ne-list">' + last.map(function (x) { return '<li><span>' + esc(x.m || 'Sujet') + '</span><em>' + fr(x.d) + '</em><b>' + fmt(x.n) + '/20</b></li>'; }).join('') + '</ul>';
    return out;
  }

  function css() {
    if (document.getElementById('ne-css')) return;
    var s = document.createElement('style'); s.id = 'ne-css';
    s.textContent =
      '.ne-card{margin-top:1.2rem;border:1px solid rgba(162,155,254,.3);background:linear-gradient(135deg,rgba(108,92,231,.1),rgba(232,67,147,.06));border-radius:16px;padding:1rem 1.2rem}' +
      '.ne-card h4{margin:0 0 .3rem;font-size:.95rem;color:var(--text,#f0efff)}.ne-hint{font-size:.8rem;color:var(--text3,#9898b8);margin:.2rem 0 .7rem}' +
      '.ne-row{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap}.ne-row input{width:92px;background:var(--bg3,#111120);border:1.5px solid var(--border2,rgba(255,255,255,.14));border-radius:10px;padding:.55rem .7rem;font:inherit;color:var(--text,#f0efff);text-align:center}' +
      '.ne-row button{background:linear-gradient(135deg,#6c5ce7,#e84393);border:0;border-radius:10px;padding:.6rem 1.1rem;color:#fff;font:inherit;font-weight:700;cursor:pointer}.ne-row button:disabled{opacity:.6;cursor:default}' +
      '.ne-msg{font-size:.8rem;margin-top:.5rem;min-height:1em}.ne-msg.ok{color:#4ade80}.ne-msg.err{color:#f87171}' +
      '.ne-chart{display:block;width:100%;max-width:420px;height:auto;margin:.8rem 0 .2rem}.ne-sum{font-size:.84rem;color:var(--text2,#c9c8e0);margin:.2rem 0 .5rem}' +
      '.ne-list{list-style:none;margin:.3rem 0 0;padding:0}.ne-list li{display:flex;gap:.7rem;align-items:baseline;padding:.35rem 0;border-top:1px solid rgba(255,255,255,.06);font-size:.82rem}' +
      '.ne-list span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2,#c9c8e0)}.ne-list em{font-style:normal;color:var(--text3,#9898b8);font-size:.75rem}.ne-list b{color:#a29bfe}';
    document.head.appendChild(s);
  }

  function paintAll() {
    var a = notes || readLocal();
    document.querySelectorAll('.ne-history').forEach(function (el) { el.innerHTML = history(a); });
  }

  window.FicheNotes = {
    render: function (text) {
      try { css(); } catch (e) {}
      var t = title(text);
      setTimeout(function () { if (notes) paintAll(); else load().then(paintAll); }, 0);
      return '<div class="ne-card" data-title="' + esc(t) + '"><h4>📈 Ta note sur 20</h4>' +
        '<p class="ne-hint">Fais le sujet, corrige-toi avec le corrigé, puis note-toi ici pour suivre ta progression.</p>' +
        '<div class="ne-row"><input type="number" class="ne-in" min="0" max="20" step="0.5" inputmode="decimal" placeholder="__ / 20" aria-label="Ta note sur 20">' +
        '<button type="button" onclick="FicheNotes.save(this)">Enregistrer ma note</button></div>' +
        '<div class="ne-msg" role="status"></div><div class="ne-history">' + history(notes || readLocal()) + '</div></div>';
    },
    save: async function (btn) {
      var card = btn.closest('.ne-card'), inp = card.querySelector('.ne-in'), msg = card.querySelector('.ne-msg');
      var v = parseFloat(String(inp.value).replace(',', '.'));
      msg.className = 'ne-msg';
      if (!isFinite(v) || v < 0 || v > 20) { msg.className = 'ne-msg err'; msg.textContent = 'Entre une note entre 0 et 20.'; return; }
      v = Math.round(v * 2) / 2;
      btn.disabled = true;
      try {
        var cur = await load();
        var next = clean(cur.concat([{ d: new Date().toISOString().slice(0, 10), m: card.getAttribute('data-title') || '', n: v }]));
        try { await persist(next); } catch (e) {
          if (/trop_volumineux/.test(e.message)) { next = next.slice(-15); await persist(next); } else throw e;
        }
        notes = next; writeLocal(next);
        inp.value = '';
        msg.className = 'ne-msg ok'; msg.textContent = '✅ Note enregistrée : ' + fmt(v) + '/20';
        paintAll();
      } catch (e) {
        msg.className = 'ne-msg err'; msg.textContent = 'Impossible d’enregistrer pour l’instant. Réessaie.';
      }
      btn.disabled = false;
    }
  };
})();
