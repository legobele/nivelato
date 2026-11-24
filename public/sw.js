// Bump CACHE when the precache list changes (same convention as the legacy sw.js).
const CACHE = 'nivelato-react-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })))))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // Firebase and font hosts are never intercepted
  const accept = e.request.headers.get('accept') || '';
  if (e.request.mode === 'navigate' || accept.includes('text/html')) {
    // network-first so a deploy is picked up; offline falls back to the cached shell (never a blank page)
    e.respondWith(fetch(e.request).then((res) => { if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', cp)).catch(() => {}); } return res; })
      .catch(() => caches.match('./index.html').then((c) => c || new Response('offline', { status: 503 }))));
    return;
  }
  e.respondWith(caches.match(e.request).then((cached) => {
    const fresh = fetch(e.request).then((res) => { if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)).catch(() => {}); } return res; }).catch(() => cached || new Response('offline', { status: 503 }));
    return cached || fresh;
  }));
});
