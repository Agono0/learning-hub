/*
 * Learning HUB service worker — offline-first app shell.
 *
 * Strategy:
 * - Navigations: network-first, fall back to the cached shell/offline page so
 *   the app opens without a connection (review sessions keep working off the
 *   last-loaded bundle; API writes queue errors visibly, honestly).
 * - Static assets (/_next/static, icons): cache-first — they are content-hashed.
 * - Same-origin API GETs: network-first with cache fallback (read-only offline).
 * - Non-GET API calls: never cached; failures surface to the UI as usual.
 */
const VERSION = 'lh-sw-v1'
const STATIC_CACHE = `${VERSION}-static`
const PAGE_CACHE = `${VERSION}-pages`
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Immutable build assets — cache first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icon')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req)
        if (hit) return hit
        try {
          const res = await fetch(req)
          if (res.ok) cache.put(req, res.clone())
          return res
        } catch {
          return new Response('', { status: 504 })
        }
      }),
    )
    return
  }

  // Navigations — network first, offline shell as the floor.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          const cache = await caches.open(PAGE_CACHE)
          cache.put(req, res.clone())
          return res
        } catch {
          const cache = await caches.open(PAGE_CACHE)
          return (
            (await cache.match(req)) ||
            (await cache.match(OFFLINE_URL)) ||
            new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } })
          )
        }
      })(),
    )
    return
  }

  // Same-origin API GETs — network first, cached copy when offline.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          if (res.ok) {
            const cache = await caches.open(`${VERSION}-api`)
            cache.put(req, res.clone())
          }
          return res
        } catch {
          const cache = await caches.open(`${VERSION}-api`)
          const hit = await cache.match(req)
          return (
            hit ||
            new Response(JSON.stringify({ ok: false, error: 'offline' }), {
              status: 503,
              headers: { 'content-type': 'application/json' },
            })
          )
        }
      })(),
    )
  }
})

// Web-push receives the payload pushed by the reminder engine (Phase 7).
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Learning HUB', body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Learning HUB', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'lh-reminder',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const url = data.url || '/'
  event.waitUntil(
    Promise.all([
      // Engagement telemetry (F-08④): fire-and-forget, never blocks or delays
      // opening the app — a failed POST must not make a notification click fail.
      fetch('/api/reminders/click', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reminderLogId: data.reminderLogId,
          kind: data.kind,
          actionUrl: url,
        }),
      }).catch(() => {}),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url)
            return client.focus()
          }
        }
        return self.clients.openWindow(url)
      }),
    ]),
  )
})
