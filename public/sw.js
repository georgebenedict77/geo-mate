const CACHE_NAME = "geo-mate-pwa-v1";
const STATIC_ASSETS = [
  "/",
  "/styles.css",
  "/app.js",
  "/auth",
  "/auth.css",
  "/auth.js",
  "/app",
  "/app.css",
  "/app-client.js",
  "/manifest.webmanifest",
  "/assets/geo-mate-logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isPageNavigation =
    request.mode === "navigate" && ["/", "/auth", "/app"].includes(url.pathname);
  const isStaticAsset =
    STATIC_ASSETS.includes(url.pathname) ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".webmanifest");

  if (!isPageNavigation && !isStaticAsset) {
    return;
  }

  if (isPageNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const responseCopy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy));
        return response;
      });
    })
  );
});
