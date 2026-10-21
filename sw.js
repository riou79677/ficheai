// Service worker minimal : rend FicheAI installable sur téléphone.
// Il ne met RIEN en cache volontairement : le site est toujours chargé à jour depuis le serveur.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* passage direct au réseau */ });
