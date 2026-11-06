// FicheAI — prix affichés sur le site. Même interrupteur que api/_tarifs.js (paiements) et que la ligne
// « tva_applicable » de la table parametres (crédits). Procédure de bascule : BASCULE_TVA.md.
// Remplit aussi automatiquement les éléments <span data-prix="pro_monthly"> et <span data-tva>.
(function () {
  if (window.FicheTarifs) return;
  var TVA = false;
  var GRILLES = {
    sans: { pro_monthly: 7.99, pro_yearly: 83.90, ultimate_monthly: 14.99, recharge_50: 6.99, recharge_150: 19.99, recharge_400: 49.99 },
    avec: { pro_monthly: 8.99, pro_yearly: 101.90, ultimate_monthly: 18.99, recharge_50: 7.99, recharge_150: 20.99, recharge_400: 53.99 }
  };
  var P = TVA ? GRILLES.avec : GRILLES.sans;

  function num(n) { return n.toFixed(2).replace('.', ','); }
  var T = {
    tva: TVA,
    prix: P,
    // « 7,99 » (sans symbole)
    num: function (k) { return num(P[k]); },
    // « 7,99 € »
    txt: function (k) { return num(P[k]) + ' €'; },
    // Pro annuel ramené au mois et économie par rapport au mensuel
    annuelParMois: function () { return num(Math.floor(P.pro_yearly / 12 * 100) / 100) + ' €'; },
    economieAnnuel: function () { return Math.round(P.pro_monthly * 12 - P.pro_yearly) + ' €'; },
    reductionAnnuel: function () { return Math.round((1 - P.pro_yearly / (P.pro_monthly * 12)) * 100); },
    // Prix d'un crédit dans une recharge, arrondi au millième : « 0,062 € »
    parCredit: function (k, credits) { return (Math.round(P[k] / credits * 1000) / 1000).toFixed(3).replace('.', ',') + ' €'; },
    // Prix du crédit en Ultimate (« 0,06 € ») et écart avec le Pro mensuel (17)
    ultimateCredit: function () { return num(Math.round(P.ultimate_monthly / 250 * 100) / 100) + ' €'; },
    ultimateVsPro: function () { return Math.round((1 - (P.ultimate_monthly / 250) / (P.pro_monthly / 110)) * 100); },
    mentionCourte: TVA ? 'TVA de 20 % incluse' : 'TVA non applicable, article 293 B du CGI',
    mentionLongue: TVA ? 'TVA de 20 % incluse.' : 'TVA non applicable, article 293 B du Code général des impôts.'
  };
  window.FicheTarifs = T;

  function fill(root) {
    var els = (root || document).querySelectorAll('[data-prix],[data-tva]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i], k = el.getAttribute('data-prix');
      if (k && P[k] != null) el.textContent = el.hasAttribute('data-sans-euro') ? num(P[k]) : num(P[k]) + ' €';
      else if (el.hasAttribute('data-tva')) el.textContent = el.getAttribute('data-tva') === 'longue' ? T.mentionLongue : T.mentionCourte;
    }
  }
  T.fill = fill;
  if (document.readyState !== 'loading') fill();
  else document.addEventListener('DOMContentLoaded', function () { fill(); });
})();
