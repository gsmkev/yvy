/*
 * Service worker de Yvy (U-17). Solo para ver la estancia en la oficina cuando se corta internet.
 *
 * - Cáscara de la app: "/" y los archivos con hash de /assets se guardan al usarlos; las navegaciones
 *   van primero a la red y, sin conexión, se responde con la cáscara guardada.
 * - Últimos datos de estancias: solo GET /org/farms y GET /org/farms/:id, red primero; la copia se usa
 *   únicamente si la red falla. Se borra al cerrar sesión o cambiar de organización (mensaje "clear-data").
 * - Todo lo demás (auth, sync, media, ingest, public, admin, me, events, devices, health, descargar-app y el
 *   resto de /org) NO pasa por acá: es el mismo conjunto que run_worker_first en apps/api/wrangler.jsonc.
 * Si se cambia este archivo, subir VERSION.
 */
const VERSION = "v1";
const SHELL = `yvy-shell-${VERSION}`;
const DATA = `yvy-data-${VERSION}`;
const WORKER_FIRST = [
  "/auth/",
  "/sync/",
  "/org/",
  "/media/",
  "/ingest/",
  "/public/",
  "/admin/",
  "/me",
  "/events",
  "/devices",
  "/health",
  "/descargar-app",
];
const FARM_DATA = /^\/org\/farms(\/[^/]+)?$/;

const isWorkerFirst = (path) => WORKER_FIRST.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(p + "/")));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(["/", "/favicon.svg", "/manifest.webmanifest"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-data") event.waitUntil(caches.delete(DATA));
});

async function networkFirst(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(fallbackKey ?? request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(fallbackKey ?? request);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (FARM_DATA.test(path) && !url.search) {
    event.respondWith(networkFirst(request, DATA));
    return;
  }
  if (isWorkerFirst(path)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL, "/"));
    return;
  }
  if (path.startsWith("/assets/")) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) await cache.put(request, res.clone());
        return res;
      }),
    );
  }
});
