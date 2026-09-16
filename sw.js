// === KÖTTELMANN APP - Service Worker v33 ===
const CACHE_NAME = 'koettelmann-v33';
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  './img/splash.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Einzelnes Caching mit Fehlerbehandlung, damit keine Exception die Installation wirft
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(asset => cache.add(asset).catch(err => console.warn('Asset fehlgeschlagen beim Caching:', asset, err)))
      );
    })
  );
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
        // Fallback falls offline
        return caches.match('./index.html');
      });
    })
  );
});
