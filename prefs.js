// Préférences de l'élève.
// Lues tout de suite depuis ce navigateur (pas de « flash » à l'affichage), puis synchronisées avec son
// compte : les mêmes réglages le suivent sur tous ses appareils. Seule la déconnexion automatique
// reste propre à chaque appareil.
(function () {
  var URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';
  var KEY = 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';
  var CACHE = 'ficheai_prefs_cache';

  var DEFAULTS = {
    theme: 'sombre',          // sombre | clair | auto
    texte: 'normal',          // normal | grand | tres_grand
    police: 'standard',       // standard | lisible
    concentration: false,     // ouvrir les fiches de la bibliothèque en mode concentration
    correction: 'cachee',     // quiz et flashcards : cachee (bouton « Voir la réponse ») | visible
    format: 'fiche',
    qualite: '',              // '' = selon le forfait | rapide | approfondi
    langue: 'auto',
    longueur: 'normale',      // synthetique | normale | detaillee
    nb_quiz: 6,
    nb_flash: 10,
    nb_questions: 6,
    consignes: '',
    objectif: 20,             // cartes à réviser par jour (Mode Révision)
    ordre: 'echeance',        // echeance | aleatoire
    alerte_credits: 20,       // alerte quand il reste ce pourcentage de crédits ; 0 = jamais
    confirmation_cout: 10,    // confirmation avant une génération de ce nombre de crédits ou plus ; 0 = jamais
    animations: 'normales',   // normales | reduites
    pdf: 'auto'               // export PDF : auto (comme le thème) | clair | sombre
  };
  var VALID = {
    theme: ['sombre', 'clair', 'auto'],
    texte: ['normal', 'grand', 'tres_grand'],
    police: ['standard', 'lisible'],
    concentration: [true, false],
    correction: ['cachee', 'visible'],
    format: ['fiche', 'quiz', 'flash', 'mindmap', 'questions', 'chrono', 'examen'],
    qualite: ['', 'rapide', 'approfondi'],
    langue: ['auto', 'fr', 'en', 'es', 'de'],
    longueur: ['synthetique', 'normale', 'detaillee'],
    nb_quiz: [6, 10],
    nb_flash: [10, 20],
    nb_questions: [6, 10],
    objectif: [10, 20, 30, 50],
    ordre: ['echeance', 'aleatoire'],
    alerte_credits: [0, 10, 20],
    confirmation_cout: [0, 5, 10],
    animations: ['normales', 'reduites'],
    pdf: ['auto', 'clair', 'sombre']
  };

  var cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE) || '{}') || {}; } catch (e) { cache = {}; }
  // Anciens réglages enregistrés uniquement dans ce navigateur
  try {
    var old = JSON.parse(localStorage.getItem('ficheai_prefs') || '{}') || {};
    if (old.format && cache.format === undefined) cache.format = old.format;
    var oldMode = localStorage.getItem('ficheai_mode');
    if (oldMode && cache.qualite === undefined) cache.qualite = oldMode;
  } catch (e) {}

  function valid(k, v) {
    if (!VALID[k]) return k === 'consignes' ? (typeof v === 'string' && v.length <= 200) : false;
    for (var i = 0; i < VALID[k].length; i++) if (VALID[k][i] === v) return true;
    return false;
  }
  function get(k) {
    var v = cache[k];
    return (v !== undefined && valid(k, v)) ? v : DEFAULTS[k];
  }
  function all() { var o = {}; for (var k in DEFAULTS) o[k] = get(k); return o; }
  function save() { try { localStorage.setItem(CACHE, JSON.stringify(cache)); } catch (e) {} }

  function resolvedTheme() {
    var t = get('theme');
    if (t === 'auto') {
      try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'clair' : 'sombre'; } catch (e) { return 'sombre'; }
    }
    return t === 'clair' ? 'clair' : 'sombre';
  }
  function applyAppearance() {
    var h = document.documentElement;
    h.setAttribute('data-theme', resolvedTheme());
    h.setAttribute('data-texte', get('texte'));
    h.setAttribute('data-police', get('police'));
    h.setAttribute('data-anim', get('animations'));
    try {
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', resolvedTheme() === 'clair' ? '#f7f5ff' : '#09090f');
    } catch (e) {}
  }
  applyAppearance();
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
      if (get('theme') === 'auto') applyAppearance();
    });
  } catch (e) {}

  function emit() {
    try { window.dispatchEvent(new CustomEvent('ficheai-prefs', { detail: all() })); } catch (e) {}
  }

  function loggedIn() {
    try { var u = JSON.parse(localStorage.getItem('ficheai_user') || 'null'); return !!(u && u.access_token); } catch (e) { return false; }
  }
  async function rpc(name, body) {
    if (!loggedIn() || !window.ficheaiToken) return null;
    var t = await window.ficheaiToken();
    if (!t) return null;
    var r = await fetch(URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + t },
      body: JSON.stringify(body || {})
    });
    if (!r.ok) return null;
    return r.json();
  }

  async function refresh() {
    try {
      var server = await rpc('get_my_preferences');
      if (!server || typeof server !== 'object' || Array.isArray(server)) return;
      var local = {};
      for (var k in DEFAULTS) if (cache[k] !== undefined && server[k] === undefined) local[k] = cache[k];
      for (var s in server) cache[s] = server[s];
      save(); applyAppearance(); emit();
      // Réglages faits sur cet appareil avant la synchronisation : on les envoie au compte.
      if (Object.keys(local).length) rpc('set_my_preferences', { p_prefs: local });
    } catch (e) {}
  }

  // Enregistre un ou plusieurs réglages (ici tout de suite, puis sur le compte).
  async function set(obj) {
    var clean = {};
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) continue;
      var v = obj[k];
      if (k === 'consignes') v = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!valid(k, v)) continue;
      cache[k] = v; clean[k] = v;
    }
    save(); applyAppearance(); emit();
    if (!Object.keys(clean).length) return { success: true };
    var res = await rpc('set_my_preferences', { p_prefs: clean });
    return res || { success: false };
  }

  // Déconnexion automatique : réglage propre à chaque appareil (en minutes, 0 = jamais).
  var device = {
    autoLogout: function () {
      var v = 30;
      try { var s = localStorage.getItem('ficheai_autologout'); if (s !== null) v = parseInt(s, 10); } catch (e) {}
      return [0, 30, 120, 480].indexOf(v) === -1 ? 30 : v;
    },
    setAutoLogout: function (min) {
      try { localStorage.setItem('ficheai_autologout', String(min)); } catch (e) {}
      emit();
    }
  };

  window.FichePrefs = { defaults: DEFAULTS, get: get, all: all, set: set, refresh: refresh, device: device, theme: resolvedTheme };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { applyAppearance(); refresh(); });
  else refresh();
})();
