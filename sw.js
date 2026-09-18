const CACHE = 'nivelato-v5';
// App shell: every file that must exist for the app to work offline.
// (Keep this list in sync with the repo — a missing file used to make
// addAll() reject and silently skip the ENTIRE precache.)
const URLS = [
  './index.html',
  './login.html',
  './dashboard.html',
  './photo.html',
  './settings.html',
  './sso.html',
  './blocked.html',
  './adhd.js',
  './auth-guard.js',
  './firebase-config.js',
  './permissions.js',
  './account-selector.js',
  './autism.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // allSettled: one missing file must never nuke the whole precache
      Promise.allSettled(URLS.map(u => c.add(new Request(u, { cache: 'reload' }))))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // cross-origin: let the browser handle it

  const accept = e.request.headers.get('accept') || '';
  const isNav = e.request.mode === 'navigate' || accept.includes('text/html');

  if (isNav) {
    // NETWORK-FIRST for navigations: always try for the newest app shell.
    // This kills the "deployed but the phone still runs old code" incident
    // class — the failure mode behind the stale-photo.html incident.
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() =>
        // Offline: cached copy, else the cached app shell (never a white page).
        caches.match(e.request).then(cached =>
          cached || caches.match('./index.html').then(shell =>
            shell || new Response('offline', { status: 503 })
          )
        )
      )
    );
    return;
  }

  // stale-while-revalidate for subresources (js/css/png): instant + refresh
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached || new Response('offline', { status: 503 }));
      return cached || fresh;
    })
  );
});
