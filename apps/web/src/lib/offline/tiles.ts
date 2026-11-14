/**
 * Guardar una estancia para usar sin conexión (ADR 0005). La página baja los PMTiles enteros y los pone en la caché
 * `yvy-tiles-files-v1`; el service worker responde desde ahí los pedidos por rango de MapLibre. Para el fondo del
 * país pide las teselas sueltas con la propia librería PMTiles: cada rango pasa por el service worker, que lo guarda.
 */
import { PMTiles } from "pmtiles";
import { LIMITS } from "@yvy/shared/limits";
import { TILE_FILES_CACHE, TILE_RANGES_CACHE } from "../../sw/names";
import { onClearLocalData } from "./clear";
import { kvGet, kvSet } from "./db";
import { checkRoom, sizeMap, type OfflinePlan, type SavedFarm, type SavedFarms } from "./tilePlan";

const KEY = "offline-farms";
const listeners = new Set<() => void>();
let cached: SavedFarms | null = null;
const emit = () => listeners.forEach((l) => l());

export const subscribeSaved = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

const EMPTY: SavedFarms = {};
/** Lo último que se leyó (para useSyncExternalStore); vacío hasta que termina la primera lectura. */
export const savedSnapshot = (): SavedFarms => cached ?? EMPTY;

export async function savedFarms(): Promise<SavedFarms> {
  if (cached) return cached;
  try {
    cached = (await kvGet<SavedFarms>(KEY)) ?? {};
  } catch {
    cached = {};
  }
  emit();
  return cached;
}

async function writeSaved(next: SavedFarms) {
  cached = next;
  await kvSet(KEY, next).catch(() => {});
  emit();
}

/** ¿Hay un service worker que pueda responder los mapas guardados? Sin él no tiene sentido ofrecer la descarga. */
export const canSaveOffline = (): boolean =>
  typeof navigator !== "undefined" && "serviceWorker" in navigator && !!navigator.serviceWorker.controller && typeof caches !== "undefined";

export interface Progress {
  doneBytes: number;
  totalBytes: number;
}

/** Baja `res` a la caché contando los bytes que pasan; devuelve el total. */
async function putCounting(cache: Cache, url: string, res: Response, onBytes: (n: number) => void): Promise<number> {
  let total = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      total += chunk.byteLength;
      onBytes(chunk.byteLength);
      ctl.enqueue(chunk);
    },
  });
  const headers = new Headers();
  for (const h of ["content-type", "etag", "last-modified"]) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  const body = res.body ? res.body.pipeThrough(counter) : null;
  await cache.put(url, new Response(body, { status: 200, headers }));
  return total;
}

export interface SaveOptions {
  onProgress?: (p: Progress) => void;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** Guarda la estancia: archivos enteros y teselas del país. Lanza OfflineQuotaError si no entra. */
export async function saveFarm(plan: OfflinePlan, opts: SaveOptions = {}): Promise<SavedFarm> {
  const f = opts.fetchImpl ?? fetch;
  const saved = await savedFarms();
  checkRoom(plan, sizeMap(saved));
  // Pide que el navegador no borre esto cuando falte espacio (si no lo da, igual se guarda).
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* no disponible */
  }
  const cache = await caches.open(TILE_FILES_CACHE);
  const totalBytes = plan.estimateBytes;
  let doneBytes = 0;
  const tick = (n: number) => {
    doneBytes += n;
    opts.onProgress?.({ doneBytes: Math.min(doneBytes, totalBytes), totalBytes });
  };
  const files: SavedFarm["files"] = [];
  for (const file of plan.files) {
    const have = await cache.match(file.url);
    if (have) {
      const bytes = Number(have.headers.get("content-length")) || file.bytes;
      tick(bytes);
      files.push({ url: file.url, bytes, layerId: file.layerId });
      continue;
    }
    const res = await f(file.url, { signal: opts.signal });
    if (!res.ok) throw new Error(`No se pudo bajar el mapa (HTTP ${res.status})`);
    const bytes = await putCounting(cache, file.url, res, tick);
    files.push({ url: file.url, bytes, layerId: file.layerId });
  }

  // Fondo del país: opcional (si todavía no está publicado, la estancia se guarda igual).
  let countryTiles = 0;
  if (plan.tiles.length) {
    const archive = new PMTiles(plan.countryUrl);
    const queue = [...plan.tiles];
    const per = LIMITS.webOffline.countryTileBytesEstimate;
    const worker = async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        if (opts.signal?.aborted) return;
        try {
          if (await archive.getZxy(t[0], t[1], t[2], opts.signal)) countryTiles++;
        } catch {
          /* tesela que no está o sin red: se sigue con las demás */
        }
        tick(per);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  const entry: SavedFarm = { savedAt: Date.now(), files, countryTiles };
  await writeSaved({ ...saved, [plan.farmId]: entry });
  return entry;
}

/** Quita la estancia; los archivos que otra estancia guardada sigue usando se quedan. */
export async function removeFarm(farmId: string): Promise<void> {
  const saved = await savedFarms();
  const mine = saved[farmId];
  if (!mine) return;
  const { [farmId]: _gone, ...rest } = saved;
  const keep = new Set(Object.values(rest).flatMap((s) => s.files.map((x) => x.url)));
  if (typeof caches !== "undefined") {
    const cache = await caches.open(TILE_FILES_CACHE);
    for (const file of mine.files) if (!keep.has(file.url)) await cache.delete(file.url);
  }
  await writeSaved(rest);
}

export interface Usage {
  /** Archivos enteros guardados. */
  savedBytes: number;
  /** Lo que usa este origen en total y lo que el navegador le deja usar, si lo informa. */
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
  maxBytes: number;
}

export async function usage(): Promise<Usage> {
  const saved = await savedFarms();
  const sizes = sizeMap(saved);
  let est: StorageEstimate = {};
  let persisted: boolean | null = null;
  try {
    est = (await navigator.storage?.estimate?.()) ?? {};
    persisted = (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    /* sin API de almacenamiento */
  }
  return {
    savedBytes: Object.values(sizes).reduce((a, b) => a + b, 0),
    usage: est.usage ?? null,
    quota: est.quota ?? null,
    persisted,
    maxBytes: LIMITS.webOffline.mapMaxBytes,
  };
}

onClearLocalData(async () => {
  cached = {};
  emit();
  if (typeof caches !== "undefined") await Promise.all([TILE_FILES_CACHE, TILE_RANGES_CACHE].map((n) => caches.delete(n)));
});
