const CACHE_NAME = 'koettelmann-v0.0.1';
const ASSETS = [
  './index.html',
  './manifest.json'
];

// Installation & Caching
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Fetch-Strategie
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});