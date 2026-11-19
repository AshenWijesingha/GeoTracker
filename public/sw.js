/* GeoTracker service worker
 * - Precaches the offline fallback page and app icons.
 * - Static build assets (/_next/static, immutable hashed files) → cache-first.
 * - Page navigations → network-first, falling back to cache, then offline.html.
 * - Cross-origin requests (Firestore, map tiles, IP lookup) are never cached
 *   here; Firestore has its own offline persistence.
 */
const VERSION = 'v3.0.0';
const STATIC_CACHE = `geotracker-static-${VERSION}`;
const PAGE_CACHE = `geotracker-pages-${VERSION}`;
const SCOPE = new URL(self.registration.scope).pathname; // e.g. "/GeoTracker/"
const OFFLINE_URL = `${SCOPE}offline.html`;
const PRECACHE = [OFFLINE_URL, `${SCOPE}manifest.json`, `${SCOPE}icons/icon.svg`, `${SCOPE}icons/icon-192.png`];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('geotracker-') && k !== STATIC_CACHE && k !== PAGE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(PAGE_CACHE);
          return (
            (await cache.match(url.pathname)) ||
            (await caches.match(OFFLINE_URL)) ||
            new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          );
        }),
    );
    return;
  }

  if (url.pathname.includes('/_next/static/') || url.pathname.includes('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

// Focus (or open) the dashboard when an alert notification is clicked.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = `${SCOPE}dashboard/`;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('/dashboard') && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
