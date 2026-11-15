/**
 * Caché de lecturas en línea (tabla local `http_cache`). Parte pura: no importa React Native, se prueba con node:sqlite.
 * Clave = usuario + organización + path (con query). Nunca guarda /org/erp/ (montos en un celular compartido).
 */
import type { Sql } from "../db/sql";

export const CACHE_MAX_ENTRY_BYTES = 200 * 1024;
export const CACHE_MAX_TOTAL_BYTES = 5 * 1024 * 1024;
/** Cuánto dura "fresco" un dato si la pantalla no pide otra cosa. */
export const DEFAULT_TTL_MS = 5 * 60_000;

export const cacheKey = (userId: string, orgId: string, path: string): string => `${userId}|${orgId}|${path}`;

/** Rutas que nunca se guardan: el ERP (montos, costos, caja). */
export const isCacheable = (path: string): boolean => !path.startsWith("/org/erp/") && path !== "/org/erp";

/** ¿Se guarda esta lectura? `cache` lo decide la pantalla, pero el ERP manda siempre. */
export const shouldCache = (path: string, cache: boolean | undefined): boolean => cache !== false && isCacheable(path);

/** Bytes UTF-8 de un texto, sin depender de TextEncoder/Buffer. */
export function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

export const isExpired = (fetchedAt: number, ttlMs: number, now: number): boolean => now - fetchedAt > ttlMs;

export interface CacheEntry {
  body: string;
  fetchedAt: number;
}

export function cacheGet(sql: Sql, key: string): CacheEntry | null {
  const r = sql.get<{ body: string; fetched_at: number }>("SELECT body, fetched_at FROM http_cache WHERE key = ?", [key]);
  return r ? { body: r.body, fetchedAt: r.fetched_at } : null;
}

export interface CachePutInput {
  userId: string;
  orgId: string;
  path: string;
  body: string;
  now: number;
}

/** Guarda una entrada. Devuelve false si no se guardó (ERP o más de 200 KB). Después de guardar, borra las más viejas hasta bajar de 5 MB. */
export function cachePut(sql: Sql, i: CachePutInput, limits = { entry: CACHE_MAX_ENTRY_BYTES, total: CACHE_MAX_TOTAL_BYTES }): boolean {
  if (!isCacheable(i.path)) return false;
  const bytes = utf8Bytes(i.body);
  const key = cacheKey(i.userId, i.orgId, i.path);
  if (bytes > limits.entry) {
    sql.run("DELETE FROM http_cache WHERE key = ?", [key]); // la copia vieja ya no representa lo que hay en el servidor
    return false;
  }
  sql.tx(() => {
    sql.run("INSERT OR REPLACE INTO http_cache (key, user_id, org_id, path, body, bytes, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      key,
      i.userId,
      i.orgId,
      i.path,
      i.body,
      bytes,
      i.now,
    ]);
    let total = sql.get<{ n: number | null }>("SELECT SUM(bytes) AS n FROM http_cache")?.n ?? 0;
    if (total <= limits.total) return;
    const old = sql.all<{ key: string; bytes: number }>("SELECT key, bytes FROM http_cache WHERE key <> ? ORDER BY fetched_at ASC", [key]);
    for (const o of old) {
      if (total <= limits.total) break;
      sql.run("DELETE FROM http_cache WHERE key = ?", [o.key]);
      total -= o.bytes;
    }
  });
  return true;
}

/** ¿Algún prefijo cubre este path? (`/org/review` cubre `/org/review?x=1`). */
export const matchesPrefix = (path: string, prefixes: string[]): boolean => prefixes.some((p) => path.startsWith(p));

/** Borra las entradas de este usuario y organización cuyo path empieza con alguno de los prefijos. */
export function cacheInvalidate(sql: Sql, userId: string, orgId: string, prefixes: string[]): number {
  let n = 0;
  sql.tx(() => {
    const rows = sql.all<{ key: string; path: string }>("SELECT key, path FROM http_cache WHERE user_id = ? AND org_id = ?", [userId, orgId]);
    for (const r of rows)
      if (matchesPrefix(r.path, prefixes)) {
        sql.run("DELETE FROM http_cache WHERE key = ?", [r.key]);
        n++;
      }
  });
  return n;
}

export function cacheDelete(sql: Sql, key: string): void {
  sql.run("DELETE FROM http_cache WHERE key = ?", [key]);
}

export function cacheClear(sql: Sql): void {
  sql.run("DELETE FROM http_cache");
}
