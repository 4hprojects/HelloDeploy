/* The build replaces this marker with an immutable list of public assets. */
const PRECACHE = /* PRECACHE_CONFIG */ null;
const CACHE_PREFIX = 'hellodeploy-static-';
const CACHE_NAME = `${CACHE_PREFIX}${PRECACHE.version}`;
const ASSETS = new Set(PRECACHE.assets.map((path) => new URL(path, self.location.origin).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Do not let a redirect (for example a proxy login page) enter the cache.
      for (const url of ASSETS) {
        const response = await fetch(url, { cache: 'reload', credentials: 'omit' });
        if (response.status !== 200 || response.redirected || response.type === 'opaque') {
          throw new Error('Unable to precache a public asset');
        }
        await cache.put(url, response);
      }
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) {
          await caches.delete(key);
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }
  if (ASSETS.has(request.url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(request.url);
        if (hit) {
          return hit;
        }
        const response = await fetch(request);
        if (response.status === 200 && !response.redirected && response.type !== 'opaque') {
          await cache.put(request.url, response.clone());
        }
        return response;
      })(),
    );
  } else if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (
          (await cache.match(new URL('/offline.html', self.location.origin).href)) ||
          Response.error()
        );
      }),
    );
  }
  // All other requests, including private APIs and SSE, go directly to network.
});
