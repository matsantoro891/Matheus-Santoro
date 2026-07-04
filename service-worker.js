const CACHE_NAME = 'crescer-juntos-v32-cache';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css?v=32',
  './app.js?v=32',
  './growth-reference.js?v=32',
  './manifest.json?v=32',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/logo-main.png',
  './themes/masculino/bebe.png?v=2',
  './themes/masculino/primeira-infancia.png?v=2',
  './themes/masculino/infancia.png?v=2',
  './themes/masculino/pre-adolescencia.png?v=2',
  './themes/masculino/adolescencia.png?v=2',
  './themes/feminino/bebe.png?v=2',
  './themes/feminino/primeira-infancia.png?v=2',
  './themes/feminino/infancia.png?v=2',
  './themes/feminino/pre-adolescencia.png?v=2',
  './themes/feminino/adolescencia.png?v=2'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (error) { console.warn(error); }
    }
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;
    if (request.mode === 'navigate') return cache.match('./index.html');
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }
  if (sameOrigin && /\.(?:js|css|html|json)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(cacheFirst(event.request));
});
