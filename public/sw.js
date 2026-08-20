// POS service worker — app-shell cache for offline use.
// ponytail: caches same-origin static assets (network-first) so the app loads
// offline after first visit. Offline sale *queue + sync* is a larger feature
// (idempotency, stock conflicts) — add when a store needs to keep selling
// through outages, not just keep the app bootable.

const CACHE = 'pos-app-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== location.origin) return
  // Never cache API calls — they must stay fresh when online.
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => {
          // SPA navigation offline → serve cached index.html.
          if (request.mode === 'navigate') return caches.match('/index.html')
          return cached
        })
      return cached || network
    }),
  )
})
