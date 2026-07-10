const CACHE_NAME = 'family-recipes-shell-v7'
const IMAGE_CACHE_NAME = 'family-recipes-image-responses-v1'
const IMAGE_RESPONSE_LIMIT = 500
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/src/styles.css', '/src/main.js', '/src/cloud.js', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon-180.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME && key !== IMAGE_CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname === '/api/images') {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request)
        if (cached) return cached
        try {
          const response = await fetch(event.request)
          if (response.ok) {
            cache.put(event.request, response.clone())
              .then(() => pruneImageResponseCache(cache))
              .catch(() => null)
          }
          return response
        } catch {
          return Response.error()
        }
      })
    )
    return
  }
  if (url.pathname.startsWith('/api/')) return
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()))
        return response
      })
      .catch(async () => {
        const cached = await caches.match(event.request)
        if (cached) return cached
        if (event.request.mode === 'navigate') return caches.match('/index.html')
        return Response.error()
      })
  )
})

async function pruneImageResponseCache(cache) {
  const keys = await cache.keys()
  if (keys.length <= IMAGE_RESPONSE_LIMIT) return
  await Promise.all(keys.slice(0, keys.length - IMAGE_RESPONSE_LIMIT).map(key => cache.delete(key)))
}
