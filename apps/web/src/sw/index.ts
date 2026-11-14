/**
 * Service worker de Yvy (ADR 0005). Lo compila el plugin de scripts/pwa-plugin.ts a /sw.js e incrusta
 * `__PRECACHE__` (la lista de la build). La lógica está en handlers.ts para poder probarla.
 */
import { createHandlers, type PrecacheManifest } from "./handlers";
import { MSG_CLEAR_DATA, MSG_SKIP_WAITING } from "./names";

declare const __PRECACHE__: PrecacheManifest;

interface Ev {
  waitUntil(p: Promise<unknown>): void;
}
interface SwScope {
  location: { origin: string };
  caches: CacheStorage;
  clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: string, fn: (e: never) => void): void;
}

const sw = self as unknown as SwScope;
const h = createHandlers({
  caches: sw.caches,
  fetch: (r) => fetch(r),
  origin: sw.location.origin,
  precache: __PRECACHE__,
});

// Sin skipWaiting: la versión nueva espera a que la persona toque "Actualizar" (mensaje skip-waiting).
sw.addEventListener("install", ((e: Ev) => e.waitUntil(h.install())) as (e: never) => void);
sw.addEventListener("activate", ((e: Ev) => e.waitUntil(h.activate().then(() => sw.clients.claim()))) as (e: never) => void);
sw.addEventListener("message", ((e: Ev & { data: unknown }) => {
  if (e.data === MSG_SKIP_WAITING) void sw.skipWaiting();
  if (e.data === MSG_CLEAR_DATA) e.waitUntil(h.clearData());
}) as (e: never) => void);
sw.addEventListener("fetch", ((e: Ev & { request: Request; respondWith(p: Promise<Response>): void }) => {
  const p = h.handle(e.request, (x) => e.waitUntil(x));
  if (p) e.respondWith(p);
}) as (e: never) => void);
