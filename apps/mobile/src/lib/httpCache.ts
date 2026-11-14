/**
 * Lectura en línea con copia local (ola 0 de la paridad con la web). Las pantallas de oficina leen la API por REST;
 * la última respuesta buena queda en `kv` (SQLite de la app) con su hora, así sin señal se ve lo último que bajó con
 * el aviso "datos de hace X". No es una tabla sincronizable: no pasa por el outbox y no tiene reglas de conflicto.
 *
 * Reglas de seguridad de la copia (la app la usan también empleados en celulares compartidos):
 * - Nunca se guarda nada de `/org/erp/*` (montos, costos, caja) ni de `/auth/*` y `/media/*`.
 * - Cada entrada es de una persona y una organización: si cambia cualquiera de las dos, no se sirve.
 * - Se borra entera al cerrar sesión, al cambiar de usuario y al cambiar de organización (`clearCache`).
 * - Tope por entrada y total, para celulares de poco almacenamiento (F-19); al pasarse se descartan las más viejas.
 */
import { HttpError, OfflineError } from "./errors";

export interface KvStore {
  getKv(key: string): string | null;
  setKv(key: string, value: string | null): void;
}

export interface CacheScope {
  userId: string;
  orgId: string;
}

export const MAX_ENTRY_BYTES = 300_000;
export const MAX_TOTAL_BYTES = 2_500_000;
export const DEFAULT_TTL_MS = 5 * 60_000;

const INDEX = "http_index";
type Index = Record<string, { at: number; bytes: number }>;

const NEVER = [/^\/org\/erp(\/|$)/, /^\/auth(\/|$)/, /^\/media(\/|$)/];
/** ¿Se puede guardar la respuesta de esta ruta en el celular? */
export const cacheable = (path: string): boolean => !NEVER.some((re) => re.test(path.split("?")[0] ?? path));

const keyOf = (scope: CacheScope, path: string) => `http:${scope.orgId}:${scope.userId}:${path}`;

function readIndex(kv: KvStore): Index {
  try {
    const raw = kv.getKv(INDEX);
    return raw ? (JSON.parse(raw) as Index) : {};
  } catch {
    return {};
  }
}
const writeIndex = (kv: KvStore, idx: Index) => kv.setKv(INDEX, Object.keys(idx).length ? JSON.stringify(idx) : null);

export interface Cached<T> {
  body: T;
  /** Cuándo la bajó este celular (epoch ms). */
  at: number;
}

export function readCache<T>(kv: KvStore, scope: CacheScope, path: string): Cached<T> | null {
  if (!cacheable(path)) return null;
  try {
    const raw = kv.getKv(keyOf(scope, path));
    if (!raw) return null;
    const v = JSON.parse(raw) as { at: unknown; body: unknown };
    return typeof v.at === "number" && "body" in v ? { body: v.body as T, at: v.at } : null;
  } catch {
    return null;
  }
}

/** Guarda una respuesta. Devuelve false si la ruta no se puede guardar o la entrada es demasiado grande. */
export function writeCache(kv: KvStore, scope: CacheScope, path: string, body: unknown, now: number): boolean {
  if (!cacheable(path)) return false;
  const text = JSON.stringify({ at: now, body });
  if (text.length > MAX_ENTRY_BYTES) return false;
  const key = keyOf(scope, path);
  const idx = readIndex(kv);
  idx[key] = { at: now, bytes: text.length };
  // Si se pasa del tope total, se van las más viejas (nunca la que se acaba de guardar).
  let total = Object.values(idx).reduce((a, e) => a + e.bytes, 0);
  for (const [k, e] of Object.entries(idx).sort((a, b) => a[1].at - b[1].at)) {
    if (total <= MAX_TOTAL_BYTES) break;
    if (k === key) continue;
    kv.setKv(k, null);
    delete idx[k];
    total -= e.bytes;
  }
  kv.setKv(key, text);
  writeIndex(kv, idx);
  return true;
}

/** Saca de la copia las rutas que empiezan con `prefix` (después de escribir algo que las cambia). */
export function invalidateCache(kv: KvStore, scope: CacheScope, prefix: string): number {
  const idx = readIndex(kv);
  const start = keyOf(scope, prefix);
  let n = 0;
  for (const k of Object.keys(idx)) {
    if (!k.startsWith(start)) continue;
    kv.setKv(k, null);
    delete idx[k];
    n++;
  }
  if (n) writeIndex(kv, idx);
  return n;
}

/** Borra toda la copia: cierre de sesión, cambio de usuario o de organización. */
export function clearCache(kv: KvStore): void {
  for (const k of Object.keys(readIndex(kv))) kv.setKv(k, null);
  kv.setKv(INDEX, null);
}

// ---------- antigüedad ----------

export type Age = { unit: "now" } | { unit: "min" | "h" | "d"; n: number };

/** Hace cuánto se bajó un dato, en la unidad más corta que lo diga bien. */
export function ageOf(at: number, now: number): Age {
  const min = Math.floor(Math.max(0, now - at) / 60_000);
  if (min < 1) return { unit: "now" };
  if (min < 60) return { unit: "min", n: min };
  if (min < 48 * 60) return { unit: "h", n: Math.floor(min / 60) };
  return { unit: "d", n: Math.floor(min / (24 * 60)) };
}

// ---------- lectura con respaldo ----------

export interface ReadResult<T> {
  data: T | null;
  /** Cuándo se bajó `data` (epoch ms); null si no hay. */
  at: number | null;
  /** `data` salió de la copia local, no de este pedido. */
  fromCache: boolean;
  /** No hubo conexión para refrescar. */
  offline: boolean;
  /** Error del servidor (403, 404, 500…), ya como texto. */
  error: { status: number; message: string } | null;
}

export interface ReadOptions {
  scope: CacheScope;
  now: number;
  /** Qué tan viejo puede ser lo guardado para no volver a pedir (por defecto 5 min). */
  ttlMs?: number;
  /** Ignora lo guardado y pide de nuevo (deslizar para refrescar). */
  force?: boolean;
  /** Quita campos antes de guardar (por ejemplo los montos). La pantalla igual muestra la respuesta completa. */
  forCache?: (body: never) => unknown;
}

/**
 * Muestra lo guardado y lo refresca si está vencido (stale-while-revalidate, pero secuencial para que una sola
 * llamada devuelva el resultado final). Sin señal conserva lo guardado y lo dice; con error del servidor también.
 */
export async function readOnline<T>(kv: KvStore, path: string, fetcher: () => Promise<T>, o: ReadOptions): Promise<ReadResult<T>> {
  const cached = readCache<T>(kv, o.scope, path);
  const ttl = o.ttlMs ?? DEFAULT_TTL_MS;
  if (cached && !o.force && o.now - cached.at < ttl) return { data: cached.body, at: cached.at, fromCache: true, offline: false, error: null };
  try {
    const body = await fetcher();
    writeCache(kv, o.scope, path, o.forCache ? o.forCache(body as never) : body, o.now);
    return { data: body, at: o.now, fromCache: false, offline: false, error: null };
  } catch (e) {
    const base = { data: cached?.body ?? null, at: cached?.at ?? null, fromCache: !!cached };
    if (e instanceof OfflineError || e instanceof TypeError) return { ...base, offline: true, error: null };
    if (e instanceof HttpError) return { ...base, offline: false, error: { status: e.status, message: e.message } };
    return { ...base, offline: false, error: { status: 0, message: e instanceof Error ? e.message : String(e) } };
  }
}
