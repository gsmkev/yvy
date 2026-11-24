/**
 * Lectura en línea con caché (stale-while-revalidate) sobre `api()`.
 * Muestra primero lo guardado y refresca si hay señal. Nunca guarda /org/erp/ (ver httpCache.ts).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@yvy/shared";
import { api, HttpError, OfflineError } from "../lib/session";
import { useSyncStatus } from "../lib/sync";
import { currentKey, onInvalidate, readCache, writeCache } from "./cache";
import { cacheDelete, DEFAULT_TTL_MS, isExpired, matchesPrefix, shouldCache } from "./httpCache";
import { getDb } from "../lib/db";

interface OnlineOptions {
  /** Cuánto tiempo un dato guardado cuenta como fresco (no se vuelve a pedir). Por defecto 5 min. */
  ttlMs?: number;
  /** false = no guardar en el celular (para datos sensibles). /org/erp/ nunca se guarda, aunque pidas true. */
  cache?: boolean;
}

export interface OnlineResult<T> {
  data: T | null;
  /** Primera carga sin nada que mostrar. */
  loading: boolean;
  /** Hay una lectura en curso (con o sin datos a la vista). */
  refreshing: boolean;
  /** Mensaje para mostrar (el del servidor en 403/404…). Solo si no hay datos que mostrar. */
  error: string | null;
  /** Lo que se ve es más viejo que `ttlMs` o no se pudo refrescar. */
  stale: boolean;
  /** Cuándo bajó lo que se ve (epoch ms). */
  fetchedAt: number | null;
  /** Sin señal (el sistema lo dice o la última lectura no pudo conectar). */
  offline: boolean;
  /** Vuelve a leer ahora, sin esperar al ttl. */
  refresh: () => Promise<void>;
}

export function useOnline<T>(path: string | null, opts: OnlineOptions = {}): OnlineResult<T> {
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const useCache = path !== null && shouldCache(path, opts.cache);
  const sysOnline = useSyncStatus().online;
  const [state, setState] = useState<{ data: T | null; fetchedAt: number | null; error: string | null; failed: boolean; netFail: boolean; refreshing: boolean; settled: boolean }>({
    data: null,
    fetchedAt: null,
    error: null,
    failed: false,
    netFail: false,
    refreshing: false,
    settled: false,
  });
  const seq = useRef(0);
  const live = useRef({ path, useCache, sysOnline });
  live.current = { path, useCache, sysOnline };

  const load = useCallback(async () => {
    const p = live.current.path;
    if (p === null) return;
    const id = ++seq.current;
    setState((s) => ({ ...s, refreshing: true }));
    try {
      const body = await api<T>("GET", p);
      if (id !== seq.current) return;
      if (live.current.useCache) {
        try {
          writeCache(p, JSON.stringify(body));
        } catch {
          /* sin lugar: se ve igual, solo no queda guardado */
        }
      }
      setState({ data: body, fetchedAt: Date.now(), error: null, failed: false, netFail: false, refreshing: false, settled: true });
    } catch (e) {
      if (id !== seq.current) return;
      const net = e instanceof OfflineError;
      const permanent = e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 408 && e.status !== 429;
      if (permanent) {
        const k = currentKey(p);
        if (k) cacheDelete(getDb().sql, k); // 403/404: lo guardado ya no vale
      }
      const msg = e instanceof Error ? e.message : t("office.loadFailed");
      setState((s) => ({
        data: permanent ? null : s.data,
        fetchedAt: permanent ? null : s.fetchedAt,
        // Con datos a la vista y un fallo pasajero se sigue mostrando lo guardado; sin datos, se muestra el error.
        error: permanent || !s.data ? (net ? null : msg) : null,
        failed: true,
        netFail: net,
        refreshing: false,
        settled: true,
      }));
    }
  }, []);

  // Al cambiar de path: lo guardado primero, y se pide si no hay copia fresca y hay señal.
  useEffect(() => {
    seq.current++;
    if (path === null) {
      setState({ data: null, fetchedAt: null, error: null, failed: false, netFail: false, refreshing: false, settled: true });
      return;
    }
    let hit: { data: T; fetchedAt: number } | null = null;
    if (useCache) {
      try {
        const c = readCache(path);
        if (c) hit = { data: JSON.parse(c.body) as T, fetchedAt: c.fetchedAt };
      } catch {
        hit = null;
      }
    }
    setState({ data: hit?.data ?? null, fetchedAt: hit?.fetchedAt ?? null, error: null, failed: false, netFail: false, refreshing: false, settled: !!hit });
    const fresh = hit && !isExpired(hit.fetchedAt, ttl, Date.now());
    if (!fresh && live.current.sysOnline) void load();
    else if (!fresh) setState((s) => ({ ...s, settled: true, netFail: true, failed: true }));
  }, [path, useCache]);

  // Cuando vuelve la señal, se refresca lo que quedó viejo o con error.
  const wasOnline = useRef(sysOnline);
  useEffect(() => {
    if (sysOnline && !wasOnline.current && path !== null) void load();
    wasOnline.current = sysOnline;
  }, [sysOnline, path, load]);

  // Una escritura en línea invalidó este path: se vuelve a leer.
  useEffect(() => onInvalidate((prefixes) => live.current.path !== null && matchesPrefix(live.current.path, prefixes) && void load()), [load]);

  const stale = state.data !== null && (state.failed || (state.fetchedAt !== null && isExpired(state.fetchedAt, ttl, Date.now())));
  return {
    data: state.data,
    loading: path !== null && !state.settled && state.data === null,
    refreshing: state.refreshing,
    error: state.error,
    stale,
    fetchedAt: state.fetchedAt,
    offline: !sysOnline || state.netFail,
    refresh: load,
  };
}
