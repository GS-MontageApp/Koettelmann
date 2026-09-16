// === KÖTTELMANN APP - Service Worker v41 ===
const CACHE_NAME = 'koettelmann-v41';
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  './img/splash.jpg',
  './img/icon-192.png',
  './img/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(asset => cache.add(asset).catch(err => console.warn('Asset fehlgeschlagen beim Caching:', asset, err)))
      );
    })
  );
  // Sofortige Aktivierung erzwingen, damit PWAs nicht auf den Neustart warten
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  // Kontrolle über alle offenen Clients sofort übernehmen
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('workers.dev')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).catch(() => {
        return caches.match('./index.html');
      });
    })
  );
});
