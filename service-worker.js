/* service-worker.js */
const CACHE_VERSION = 'v6'; // <-- bump this EVERY deploy
const STATIC_CACHE = `mmp-mintug-static-${CACHE_VERSION}`;

// Put only immutable assets here (NOT index.html)
const STATIC_ASSETS = [
  './',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== STATIC_CACHE ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

// Allow the page to force-activate a waiting worker
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Let browser handle cross-origin requests normally
  if (url.origin !== self.location.origin) return;

  const isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  // ✅ Network-first for HTML so users always get latest shell
  if (isHTML) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        return fresh;
      } catch (e) {
        // Offline fallback: try cached home
        const cache = await caches.open(STATIC_CACHE);
        return (await cache.match('./')) || (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // ✅ Cache-first for static assets (fast), update cache in background
  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;

    const fresh = await fetch(req);
    // Only cache successful basic responses
    if (fresh && fresh.ok && fresh.type === 'basic') {
      cache.put(req, fresh.clone());
    }
    return fresh;
  })());
});
