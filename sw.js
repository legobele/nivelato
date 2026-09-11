const CACHE = 'nivelato-v3';
const URLS = [
  './index.html',
  './dashboard.html',
  './adhd.js',
  './style.css',
  './autism.css',
  './manifest.json',
  './favicon.ico',
  './160.png',
  './192.png',
  './512.png',
  './maskable-192.png',
  './maskable-512.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(URLS.map(u => new Request(u, {mode: 'no-cors'}))).catch(() => {/* cache what we can */}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached || new Response('offline', {status: 503}));
      // stale-while-revalidate: serve cache instantly, refresh in background
      return cached || fresh;
    })
  );
});
