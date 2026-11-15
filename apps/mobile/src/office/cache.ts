/** Pegamento entre la caché (httpCache.ts) y la app: usuario/organización de la sesión, base local y aviso a pantallas abiertas. */
import { getDb } from "../lib/db";
import { getSession } from "../lib/session";
import { cacheGet, cacheInvalidate, cacheKey, cachePut, type CacheEntry } from "./httpCache";

type Listener = (prefixes: string[]) => void;
const listeners = new Set<Listener>();

export const onInvalidate = (f: Listener): (() => void) => (listeners.add(f), () => listeners.delete(f));

/** Clave de caché de este path para la sesión actual; null sin sesión. */
export function currentKey(path: string): string | null {
  const s = getSession();
  return s ? cacheKey(s.user.id, s.organization.id, path) : null;
}

export function readCache(path: string): CacheEntry | null {
  const k = currentKey(path);
  return k ? cacheGet(getDb().sql, k) : null;
}

export function writeCache(path: string, body: string): void {
  const s = getSession();
  if (s) cachePut(getDb().sql, { userId: s.user.id, orgId: s.organization.id, path, body, now: Date.now() });
}

/** Invalida por prefijo de path: borra la copia guardada y avisa a las pantallas abiertas para que vuelvan a leer. */
export function invalidate(prefixes: string[]): void {
  const s = getSession();
  if (s) cacheInvalidate(getDb().sql, s.user.id, s.organization.id, prefixes);
  listeners.forEach((f) => f(prefixes));
}
