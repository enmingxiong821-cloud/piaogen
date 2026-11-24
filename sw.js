const CACHE = "piaogen-v9-11";
const CORE = [
  "./",
  "./index.html",
  "./miniapp.html",
  "./afterpay.html",
  "./evidence.html",
  "./privacy.html",
  "./terms.html",
  "./licenses.html",
  "./docs.css",
  "./styles.css",
  "./app.js",
  "./rules.js",
  "./agents.js",
  "./realdata.js",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./vendor/tesseract.min.js",
  "./vendor/jszip.min.js",
  "./vendor/pdf.min.js",
  "./vendor/worker.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes("/vendor/lang/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const hit = await caches.match(request);
          return hit || caches.match("./index.html");
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok && /\.(?:js|css|png|jpg|jpeg|svg|webp|wasm|gz|woff2?)$/.test(url.pathname)) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
