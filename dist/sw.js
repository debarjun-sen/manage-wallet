// Manage Wallet service worker: precache the app shell + built assets, then cache-first.
const CACHE = 'manage-wallet-v3'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      let assets = []
      try {
        const html = await (await fetch('/index.html', { cache: 'no-store' })).text()
        assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
      } catch {
        /* offline during install: shell only */
      }
      await cache.addAll([...SHELL, ...assets])
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    // Network first so updates show up; fall back to cached shell offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Only cache real app pages: never an error page or a redirect to somewhere else.
          if (res.ok && res.type === 'basic' && !res.redirected) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put('/index.html', copy))
          }
          return res
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
