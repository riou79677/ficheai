// Mesure d'audience Vercel Web Analytics, chargée seulement si le visiteur ne s'y est pas opposé.
// Conditions de l'exemption de consentement (CNIL) : finalité limitée à la mesure d'audience, statistiques anonymes,
// information des visiteurs (politique de confidentialité) et possibilité de s'y opposer (bouton dans cette politique).
// Le signal « Global Privacy Control » du navigateur est aussi respecté.
(function () {
  var off = false;
  try { off = localStorage.getItem('ficheai_audience') === 'off'; } catch (e) {}
  try { if (navigator.globalPrivacyControl === true) off = true; } catch (e) {}
  if (off) return;
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  var s = document.createElement('script');
  s.defer = true;
  s.src = '/_vercel/insights/script.js';
  document.head.appendChild(s);
})();
