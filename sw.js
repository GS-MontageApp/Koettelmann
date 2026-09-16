// === KÖTTELMANN APP - Service Worker v43 (Network-First Strategie) ===
const CACHE_NAME = 'koettelmann-v43';
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
  // Sofortige Aktivierung erzwingen
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
  // Kontrolle sofort übernehmen
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Externe Anfragen (Cloudflare Proxy / WDR API) direkt durchlassen
  if (requestUrl.origin !== location.origin || requestUrl.search.includes('workers.dev')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-First Strategie für HTML / Einstiegspunkt (index.html)
  if (event.request.mode === 'navigate' || requestUrl.pathname.endsWith('.html') || requestUrl.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
            // Wenn Server antwortet, Cache im Hintergrund aktualisieren
            if (networkResponse && networkResponse.status === 200) {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                });
            }
            return networkResponse;
        })
        .catch(() => {
            // Offline-Fallback auf den Cache
            return caches.match(event.request).then((cachedResponse) => {
                return cachedResponse || caches.match('./index.html');
            });
        })
    );
    return;
  }

  // Cache-First Strategie für statische Assets (Bilder, Manifest, Icons)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).catch(() => {
        return caches.match('./index.html');
      });
    })
  );
});
