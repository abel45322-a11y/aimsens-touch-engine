const CACHE_NAME = 'aimsens-v1.0.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './engine.js',
  './engine.bundle.js',
  './manifest.json'
];

// Install Event: Cache Core Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Cleanup Old Caches
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
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache First with Network Fallback
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});

// Touch Frame Synchronization & Background Sync Interface
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_TOUCH_CONFIG') {
    // Persist configuration update across service worker instances
    self.touchEngineConfig = event.data.config;
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ status: 'CONFIG_SYNCED', time: Date.now() });
    }
  }
});
