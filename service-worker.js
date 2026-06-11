const CACHE_NAME = "study-tools-web-v6";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./app.ico",
  "./assets/images/icons/icon-192x192.png",
  "./assets/images/icons/icon-512x512.png",
  "./assets/images/icons/icon-192x192-maskable.png",
  "./assets/images/icons/icon-512x512-maskable.png",
  "./assets/images/icons/apple-touch-icon.png",
  "./assets/vendor/sql-wasm.js",
  "./assets/vendor/sql-wasm.wasm",
  "./data/sql_exam_questions.json",
  "./data/sg_past_exams.json",
  "./data/it_passport_past_exams.json",
  "./data/python_lessons.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

function isApiRequest(url) {
  try {
    return new URL(url).pathname.startsWith("/api/");
  } catch {
    return url.includes("/api/");
  }
}

function isStaticAsset(url) {
  try {
    const pathname = new URL(url).pathname;
    return pathname.startsWith("/assets/") || pathname.startsWith("/data/");
  } catch {
    return false;
  }
}

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // --- API requests: network-only, never cached ---
  if (isApiRequest(event.request.url)) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: "offline", message: "网络不可用，请检查连接" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // --- Navigation (HTML pages): network-first, fallback to index.html ---
  if (isNavigationRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // --- Static assets (CSS, JS, vendor, images, data): stale-while-revalidate ---
  // Uses ignoreSearch:true to match cached resources regardless of ?v= version parameters.
  // This means an old version serves instantly from cache, then background-fetches the
  // new version. The next page load gets the freshest version.
  if (isStaticAsset(event.request.url)) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // --- Everything else (manifest, favicon, etc.): stale-while-revalidate ---
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
