const CACHE_NAME = 'axis-visits-shell-v1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=12',
  './app.js?v=10',
  './manifest.webmanifest',
  './axis-logo-black.svg',
  './axis-visits-icon.svg',
  './axis-visits-icon-192.png',
  './axis-visits-icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('axis-visits-shell-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const appPath = new URL('./', self.location.href).pathname;
  if (url.origin !== self.location.origin || !url.pathname.startsWith(appPath)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  const isShellAsset = /\.(?:css|js|svg|png|webmanifest)$/.test(url.pathname);
  if (!isShellAsset) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
