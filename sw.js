const CACHE = "piaogen-v11-1";
const CORE = [
  "./",
  "./index.html",
  "./miniapp.html",
  "./afterpay.html",
  "./agent-api.html",
  "./alipay.html",
  "./evidence.html",
  "./privacy.html",
  "./terms.html",
  "./licenses.html",
  "./docs.css",
  "./styles.css",
  "./toolbox.css",
  "./testkit.css",
  "./v109.css",
  "./v110.css",
  "./v111.css",
  "./rights.html",
  "./app.js",
  "./toolbox-data.js",
  "./toolbox.js",
  "./testkit.js",
  "./library.js",
  "./health.js",
  "./datepicker.js",
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

/* 代码与样式一律「网络优先」，避免旧缓存把新 HTML 配旧 CSS（会出现白底白字的按钮）。
   只有图片、字体、wasm 这类大体积静态资源才走缓存优先。 */
const NETWORK_FIRST = /\.(?:html|js|css|webmanifest)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    const hit = (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes("/vendor/lang/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request).catch(async () => (await caches.match(request)) || caches.match("./index.html"))
    );
    return;
  }

  if (NETWORK_FIRST.test(url.pathname)) {
    event.respondWith(networkFirst(request).catch(() => new Response("", { status: 504 })));
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});