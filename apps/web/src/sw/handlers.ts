/**
 * Lógica del service worker (ADR 0005), sin tocar `self`: recibe las cachés y `fetch` por parámetro para probarla.
 *
 * - Cáscara: todo lo que lista la build se precachea con la versión por hash; las navegaciones de la app sirven el
 *   `index.html` precacheado. La versión nueva espera a que la persona toque "Actualizar".
 * - Lecturas: GET /org/* y /me, red primero; la copia solo responde si NO hubo red (nunca ante un 401 o un 500).
 * - Mapa: PMTiles de otro origen por rango, desde el archivo entero guardado o desde el rango exacto ya visto.
 * - Todo lo demás (auth, sync, media, ingest, admin, public, v1, escrituras) pasa derecho a la red.
 */
import { LIMITS } from "@yvy/shared/limits";
import {
  DATA_CACHE,
  FONTS_CACHE,
  FROM_CACHE_HEADER,
  PRIVATE_CACHES,
  SAVED_AT_HEADER,
  SHELL_PREFIX,
  TILE_FILES_CACHE,
  TILE_RANGES_CACHE,
} from "./names";
import { FONT_HOSTS, isCacheableData, isWorkerFirst } from "./policy";
import { parseRange, rangeKey, sliceResponse } from "./ranges";
import { PieceCache } from "./tileCache";

export interface PrecacheManifest {
  /** Hash de la build: cambia si cambia cualquier archivo. */
  version: string;
  /** Todas las rutas (con "/" para el index.html). */
  urls: string[];
  /** Sin estas no se instala: el index.html y lo que carga al arrancar. */
  critical: string[];
}

export type Route = "navigate" | "asset" | "data" | "tiles" | "fonts";

export interface HandlerDeps {
  caches: CacheStorage;
  fetch: (r: Request) => Promise<Response>;
  origin: string;
  precache: PrecacheManifest;
  now?: () => number;
}

/** Para seguir trabajando después de responder (guardar una copia): `event.waitUntil` del pedido. */
export type WaitUntil = (p: Promise<unknown>) => void;

export function classify(request: Pick<Request, "method" | "url" | "mode">, origin: string, precached: ReadonlySet<string>): Route | null {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  if (url.origin !== origin) {
    if ((FONT_HOSTS as readonly string[]).includes(url.hostname)) return "fonts";
    return url.pathname.endsWith(".pmtiles") ? "tiles" : null;
  }
  const path = url.pathname;
  if (isCacheableData(path)) return "data";
  if (isWorkerFirst(path)) return null;
  if (request.mode === "navigate") return "navigate";
  if (path === "/sw.js") return null;
  if (path.startsWith("/assets/") || precached.has(path)) return "asset";
  return null;
}

const withHeader = (res: Response, name: string, value: string): Response => {
  const headers = new Headers(res.headers);
  headers.set(name, value);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

export function createHandlers(deps: HandlerDeps) {
  const { caches: cs, precache } = deps;
  const now = deps.now ?? Date.now;
  const shellName = SHELL_PREFIX + precache.version;
  const precached = new Set(precache.urls);
  const abs = (path: string) => new URL(path, deps.origin).href;
  const pieces = new PieceCache(() => cs.open(TILE_RANGES_CACHE), LIMITS.webOffline.mapRangeCacheMaxBytes);

  async function install(): Promise<void> {
    const cache = await cs.open(shellName);
    const get = async (path: string) => {
      // El index.html y el manifiesto no llevan hash: se piden sin la caché HTTP.
      const req = new Request(abs(path), path.startsWith("/assets/") ? undefined : { cache: "reload" });
      const res = await deps.fetch(req);
      if (!res.ok) throw new Error(`precache ${path}: HTTP ${res.status}`);
      await cache.put(abs(path), res);
    };
    await Promise.all(precache.critical.map(get));
    // El resto es lo que carga a pedido (pantallas, PDF, planillas): si algo falla se completa al usarlo.
    const rest = precache.urls.filter((u) => !precache.critical.includes(u));
    await Promise.allSettled(rest.map(get));
  }

  async function activate(): Promise<void> {
    const keep = new Set([shellName, FONTS_CACHE, ...PRIVATE_CACHES]);
    for (const k of await cs.keys()) {
      // Cachés viejas de la cáscara (y la `yvy-shell-v1` de U-17); las de datos y mapas las manejan sus dueños.
      if (!keep.has(k) && (k.startsWith(SHELL_PREFIX) || k.startsWith("yvy-data-") || k.startsWith("yvy-tiles-"))) await cs.delete(k);
    }
  }

  async function clearData(): Promise<void> {
    for (const name of PRIVATE_CACHES) await cs.delete(name);
    await pieces.clear();
  }

  async function navigate(request: Request): Promise<Response> {
    const shell = await cs.open(shellName);
    const hit = await shell.match(abs("/"));
    return hit ?? deps.fetch(request);
  }

  async function asset(request: Request, later: WaitUntil): Promise<Response> {
    const shell = await cs.open(shellName);
    const key = abs(new URL(request.url).pathname);
    const hit = await shell.match(key);
    if (hit) return hit;
    const res = await deps.fetch(request);
    if (res.ok && res.type !== "opaque") later(shell.put(key, res.clone()));
    return res;
  }

  async function data(request: Request, later: WaitUntil): Promise<Response> {
    const cache = await cs.open(DATA_CACHE);
    try {
      const res = await deps.fetch(request);
      if (res.status === 200 && !res.headers.has("set-cookie")) {
        const headers = new Headers(res.headers);
        headers.set(SAVED_AT_HEADER, String(now()));
        const copy = new Response(res.clone().body, { status: 200, headers });
        later(
          cache.put(request.url, copy).then(async () => {
            const keys = await cache.keys();
            for (const k of keys.slice(0, Math.max(0, keys.length - LIMITS.webOffline.dataCacheMaxEntries))) await cache.delete(k);
          }),
        );
      }
      return res;
    } catch (err) {
      // Solo una falla de red usa la copia: un 401 o un 500 del servidor se le muestran a la persona tal cual.
      const hit = await cache.match(request.url);
      if (!hit) throw err;
      return withHeader(hit, FROM_CACHE_HEADER, hit.headers.get(SAVED_AT_HEADER) ?? "1");
    }
  }

  async function tiles(request: Request, later: WaitUntil): Promise<Response> {
    const range = parseRange(request.headers.get("range"));
    const files = await cs.open(TILE_FILES_CACHE);
    const whole = await files.match(request.url);
    if (whole) return range ? sliceResponse(whole, range) : whole;
    if (!range || range.suffix !== undefined || range.end === undefined) return deps.fetch(request);
    const key = rangeKey(request.url, range);
    try {
      const res = await deps.fetch(request);
      if (res.status === 206) later(pieces.put(key, res.clone(), now()));
      return res;
    } catch (err) {
      const hit = await pieces.get(key);
      if (!hit) throw err;
      return hit;
    }
  }

  async function fonts(request: Request, later: WaitUntil): Promise<Response> {
    const cache = await cs.open(FONTS_CACHE);
    const hit = await cache.match(request.url);
    const refresh = deps
      .fetch(request)
      .then(async (res) => {
        if (res.ok || res.type === "opaque") await cache.put(request.url, res.clone());
        return res;
      });
    if (hit) {
      later(refresh);
      return hit;
    }
    return refresh;
  }

  /** null = no la maneja el service worker (sigue a la red). */
  function handle(request: Request, waitUntil?: WaitUntil): Promise<Response> | null {
    const later: WaitUntil = (p) => {
      const safe = p.catch(() => {});
      try {
        (waitUntil ?? (() => {}))(safe);
      } catch {
        /* el evento ya terminó: la copia se guarda igual, solo que sin extender su vida */
      }
    };
    switch (classify(request, deps.origin, precached)) {
      case "navigate":
        return navigate(request);
      case "asset":
        return asset(request, later);
      case "data":
        return data(request, later);
      case "tiles":
        return tiles(request, later);
      case "fonts":
        return fonts(request, later);
      default:
        return null;
    }
  }

  return { install, activate, clearData, handle, shellName };
}
