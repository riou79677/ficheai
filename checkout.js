// Récapitulatif de commande commun à tout le site (abonnements et recharges).
// Avant le paiement, le client voit l'offre, le prix TTC, la durée, le renouvellement, l'essai, la résiliation et la
// rétractation, coche les CGV et la demande d'exécution immédiate, puis valide avec un bouton qui exprime l'obligation
// de paiement (art. L221-5, L221-14, L221-25 et L221-28 du Code de la consommation).
// Les anciens liens de paiement Stripe (buy.stripe.com) présents dans les pages sont redirigés ici automatiquement.
(function () {
  var OFFERS = {
    pro_monthly: { kind: 'sub', plan: 'pro', title: '⚡ FicheAI Pro, formule mensuelle', price: '7,99 €', per: 'mois', trial: 7,
      what: '50 générations par mois, Chat IA (20 messages par mois), import de PDF jusqu\'à 40 pages, sujets d\'examen et export PDF.' },
    pro_yearly: { kind: 'sub', plan: 'pro', title: '⚡ FicheAI Pro, formule annuelle', price: '79,90 €', per: 'an',
      what: '50 générations par mois pendant un an, Chat IA (20 messages par mois), import de PDF jusqu\'à 40 pages, sujets d\'examen et export PDF.' },
    ultimate_monthly: { kind: 'sub', plan: 'ultimate', title: '👑 FicheAI Ultimate, formule mensuelle', price: '14,99 €', per: 'mois',
      what: '300 générations et 300 messages de Chat IA par mois, import de PDF jusqu\'à 50 pages, lecture des schémas, sujets d\'examen et export PDF.' },
    recharge_50: { kind: 'pack', title: '🔋 Recharge de 50 générations', price: '6,99 €', credits: 50 },
    recharge_150: { kind: 'pack', title: '🔋 Recharge de 150 générations', price: '19,99 €', credits: 150 },
    recharge_400: { kind: 'pack', title: '🔋 Recharge de 400 générations', price: '49,99 €', credits: 400 }
  };
  // Anciens liens de paiement Stripe -> offre correspondante.
  var LINKS = {
    '00wfZibWR8Zl8o7eUK43S05': 'pro_monthly', '6oUeVe5yt5N96fZ3c243S0c': 'pro_yearly', 'aFadRaaSN2AX33NeUK43S07': 'ultimate_monthly',
    '28E14o9OJdfBgUD4g643S09': 'recharge_50', '7sY8wQbWRgrN6fZ6oe43S0a': 'recharge_150', '14A14o2mhdfB7k3bIy43S0b': 'recharge_400'
  };

  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function readUser() { try { return JSON.parse(localStorage.getItem('ficheai_user') || 'null'); } catch (e) { return null; } }
  async function token() {
    try { if (window.ficheaiToken) { var t = await window.ficheaiToken(); if (t) return t; } } catch (e) {}
    var u = readUser(); return (u && u.access_token) || '';
  }
  function frDate(d) { return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }

  var overlay = null, lastFocus = null;
  function close() {
    if (!overlay) return;
    overlay.remove(); overlay = null;
    document.removeEventListener('keydown', onKey, true);
    try { if (lastFocus) lastFocus.focus(); } catch (e) {}
  }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }

  function shell(inner) {
    close();
    lastFocus = document.activeElement;
    overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'fa-co-title');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(5,5,12,0.78);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));font-family:inherit';
    overlay.innerHTML = '<div style="background:#0f0f1a;color:#f0efff;border:1px solid rgba(124,109,250,0.35);border-radius:18px;max-width:470px;width:100%;margin:auto;padding:1.4rem 1.3rem 1.2rem;box-shadow:0 20px 60px rgba(0,0,0,0.5);line-height:1.5">' + inner + '</div>';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    var x = overlay.querySelector('[data-close]');
    if (x) x.addEventListener('click', close);
    var first = overlay.querySelector('input,button');
    if (first) try { first.focus(); } catch (e) {}
    return overlay;
  }

  var P = 'font-size:0.86rem;color:#c9c7e3;margin:0 0 0.55rem';
  function closedView(o) {
    shell('<h2 id="fa-co-title" style="font-size:1.12rem;margin:0 0 0.7rem">' + esc(o.title) + '</h2>'
      + '<p style="' + P + '">Les abonnements et les recharges ouvrent très bientôt : FicheAI finalise ses démarches légales.</p>'
      + '<p style="' + P + '">En attendant, le plan Starter reste gratuit (5 générations par semaine).</p>'
      + '<button data-close style="width:100%;margin-top:0.6rem;padding:0.8rem;border:none;border-radius:12px;background:#24243a;color:#fff;font-weight:700;font-size:0.92rem;cursor:pointer">Fermer</button>');
  }

  function recapView(key, o, info) {
    var lines = [];
    if (o.kind === 'sub') {
      var upgrade = info.plan === 'pro' && o.plan === 'ultimate';
      var trial = o.trial && info.trial_available !== false ? o.trial : 0;
      lines.push('<b>Contenu :</b> ' + esc(o.what));
      if (upgrade) {
        lines.push('<b>Prix :</b> ' + esc(o.price) + ' TTC par mois. Ton abonnement Pro passe immédiatement en Ultimate : la différence pour la période en cours est facturée aujourd\'hui, au prorata.');
      } else if (trial) {
        var first = frDate(new Date(Date.now() + trial * 86400000));
        lines.push('<b>Essai gratuit de ' + trial + ' jours :</b> rien n\'est prélevé aujourd\'hui. Sans résiliation avant le ' + esc(first) + ', ' + esc(o.price) + ' TTC seront prélevés ce jour-là, puis chaque mois.');
      } else if (o.per === 'an') {
        lines.push('<b>Prix :</b> ' + esc(o.price) + ' TTC prélevés aujourd\'hui (soit 6,66 € par mois).');
      } else {
        lines.push('<b>Prix :</b> ' + esc(o.price) + ' TTC prélevés aujourd\'hui, puis chaque mois.');
      }
      lines.push(o.per === 'an'
        ? '<b>Durée :</b> un an, renouvelé automatiquement chaque année jusqu\'à résiliation. Tu seras prévenu par e-mail avant chaque renouvellement.'
        : '<b>Durée :</b> sans engagement, renouvelé automatiquement chaque mois jusqu\'à résiliation.');
      lines.push('<b>Résiliation :</b> à tout moment, en quelques clics, depuis Paramètres → « Résilier mon abonnement ». Tu gardes l\'accès jusqu\'à la fin de la période payée.');
      lines.push('<b>Rétractation :</b> 14 jours après la commande, avec le lien « Renoncer au contrat ici » en bas de chaque page.');
    } else {
      lines.push('<b>Contenu :</b> ' + o.credits + ' générations supplémentaires, créditées immédiatement et utilisables pendant 12 mois, une fois ton quota du mois épuisé.');
      lines.push('<b>Prix :</b> paiement unique de ' + esc(o.price) + ' TTC, sans abonnement.');
      lines.push('<b>Rétractation :</b> comme les générations sont fournies immédiatement, le droit de rétractation prend fin dès qu\'elles sont créditées (si tu coches la case ci-dessous).');
    }
    lines.push('Prix TTC, TVA non applicable (article 293 B du CGI). Paiement sécurisé par Stripe.');

    var c2 = o.kind === 'sub'
      ? 'Je demande à accéder à mon abonnement dès maintenant, sans attendre la fin du délai de rétractation de 14 jours. Si je me rétracte, je paierai seulement la part du service déjà fournie (rien pendant l\'essai gratuit).'
      : 'Je demande que les générations soient créditées immédiatement et je reconnais perdre mon droit de rétractation dès qu\'elles le sont.';
    var box = 'display:flex;gap:0.6rem;align-items:flex-start;font-size:0.84rem;color:#e4e2f5;margin:0.55rem 0;cursor:pointer';
    var cb = 'width:18px;height:18px;flex:0 0 18px;margin-top:2px;accent-color:#7c6dfa;cursor:pointer';
    var ov = shell('<h2 id="fa-co-title" style="font-size:1.12rem;margin:0 0 0.2rem">Récapitulatif de ta commande</h2>'
      + '<p style="font-size:0.95rem;font-weight:700;margin:0 0 0.8rem;color:#b9b1ff">' + esc(o.title) + '</p>'
      + lines.map(function (l) { return '<p style="' + P + '">' + l + '</p>'; }).join('')
      + '<div style="border-top:1px solid rgba(255,255,255,0.1);margin:0.9rem 0 0.4rem"></div>'
      + '<label style="' + box + '"><input type="checkbox" id="fa-co-cgv" style="' + cb + '"><span>J\'ai lu et j\'accepte les <a href="/cgu.html#cgv" target="_blank" rel="noopener" style="color:#b9b1ff">conditions générales d\'utilisation et de vente</a>.</span></label>'
      + '<label style="' + box + '"><input type="checkbox" id="fa-co-imm" style="' + cb + '"><span>' + c2 + '</span></label>'
      + '<p id="fa-co-err" role="alert" style="display:none;color:#ff9db4;font-size:0.83rem;margin:0.5rem 0 0"></p>'
      + '<button id="fa-co-go" disabled style="width:100%;margin-top:0.8rem;padding:0.85rem;border:none;border-radius:12px;background:linear-gradient(135deg,#6c5ce7,#fd79a8);color:#fff;font-weight:800;font-size:0.95rem;cursor:pointer;opacity:0.5">Commander avec obligation de paiement</button>'
      + '<p style="font-size:0.75rem;color:#9a98b8;margin:0.6rem 0 0;text-align:center">Tu vas être redirigé vers la page de paiement sécurisée de Stripe.</p>'
      + '<button data-close style="width:100%;margin-top:0.5rem;padding:0.6rem;border:none;border-radius:10px;background:transparent;color:#9a98b8;font-size:0.85rem;cursor:pointer">Annuler</button>');
    var a = ov.querySelector('#fa-co-cgv'), b = ov.querySelector('#fa-co-imm'), go = ov.querySelector('#fa-co-go'), err = ov.querySelector('#fa-co-err');
    function upd() { var ok = a.checked && b.checked; go.disabled = !ok; go.style.opacity = ok ? '1' : '0.5'; }
    a.addEventListener('change', upd); b.addEventListener('change', upd);
    go.addEventListener('click', async function () {
      if (go.disabled) return;
      go.disabled = true; go.textContent = 'Redirection vers le paiement…'; err.style.display = 'none';
      try {
        var t = await token();
        if (!t) { location.href = '/login.html'; return; }
        var r = await fetch('/api/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
          body: JSON.stringify({ offer: key, consent: { cgv: true, immediate: true } })
        });
        var d = {}; try { d = await r.json(); } catch (e) {}
        if (d.url) { location.href = d.url; return; }
        if (r.status === 401) { location.href = '/login.html'; return; }
        if (d.code === 'SALES_CLOSED') { closedView(o); return; }
        throw new Error(d.error || 'Le paiement est momentanément indisponible. Réessaie dans un instant.');
      } catch (e) {
        err.textContent = '⚠️ ' + e.message; err.style.display = 'block';
        go.textContent = 'Commander avec obligation de paiement'; upd();
      }
    });
  }

  window.ficheaiBuy = async function (key) {
    var o = OFFERS[key];
    if (!o) return;
    var u = readUser();
    if (!u || !u.email) {
      if (o.kind === 'sub') location.href = '/signup.html?plan=' + o.plan + '&billing=' + (key === 'pro_yearly' ? 'yearly' : 'monthly');
      else location.href = '/login.html';
      return;
    }
    shell('<p style="margin:0;font-size:0.9rem;color:#c9c7e3">Chargement du récapitulatif…</p>');
    var info = { sales_open: false, plan: null, trial_available: null };
    try {
      var t = await token();
      var r = await fetch('/api/create-checkout', { headers: t ? { 'Authorization': 'Bearer ' + t } : {}, cache: 'no-store' });
      info = await r.json();
    } catch (e) {}
    if (!info.sales_open) { closedView(o); return; }
    recapView(key, o, info);
  };

  // Les liens de paiement Stripe des pages (y compris ceux créés dynamiquement) ouvrent le récapitulatif.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href*="buy.stripe.com/"]') : null;
    if (!a) return;
    var id = (a.getAttribute('href') || '').split('buy.stripe.com/')[1] || '';
    var key = LINKS[id.split(/[?#]/)[0]];
    if (!key) return;
    e.preventDefault(); e.stopPropagation();
    window.ficheaiBuy(key);
  }, true);

  // Reprise d'une commande après inscription ou connexion : /settings.html?offre=pro_monthly
  function resume() {
    try {
      var k = new URLSearchParams(location.search).get('offre');
      if (k && OFFERS[k]) {
        history.replaceState(null, '', location.pathname + location.hash);
        window.ficheaiBuy(k);
      }
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', resume); else resume();
})();
