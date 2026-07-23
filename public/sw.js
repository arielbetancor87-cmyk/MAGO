/* MAGO Drinks POS — Service Worker
   Estrategia: network-first con fallback a caché.
   Primera visita con internet guarda la app; después funciona offline. */
const CACHE = "mago-pos-v1"

self.addEventListener("install", (e) => {
  self.skipWaiting()
})

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url)
  // Solo GET del mismo origen (la app). Firebase maneja su propio offline.
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200) {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, copy))
        }
        return res
      })
      .catch(() =>
        caches.match(e.request).then(hit =>
          hit || (e.request.mode === "navigate" ? caches.match("/index.html") : undefined)
        )
      )
  )
})
