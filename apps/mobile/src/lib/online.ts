/**
 * Hooks de la capa en línea (ola 0): `useOnline` para leer con copia local y `useOnlineMutation` para escribir.
 * La lógica está en httpCache.ts y writeOnline.ts (sin React) para poder probarla.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFocusEffect } from "expo-router";
import { getDb } from "./db";
import { clearCache, invalidateCache, readCache, readOnline, type ReadOptions, type ReadResult } from "./httpCache";
import { api, getSession, useSession, type Session } from "./session";
import { useSyncStatus } from "./sync";
import { runWrite, type WriteState } from "./writeOnline";

const scopeOf = (s: Session | null) => (s ? { userId: s.user.id, orgId: s.organization.id } : null);

// Cuando una escritura cambia datos, las pantallas abiertas que los leen se actualizan solas.
let cacheVersion = 0;
const subs = new Set<() => void>();
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
const bump = () => {
  cacheVersion++;
  subs.forEach((f) => f());
};

/** Saca de la copia las rutas que empiezan con `prefix` y avisa a las pantallas abiertas. */
export function invalidate(...prefixes: string[]): void {
  const scope = scopeOf(getSession());
  if (scope) for (const p of prefixes) invalidateCache(getDb(), scope, p);
  bump();
}

/** Borra toda la copia de lectura (cierre de sesión, cambio de usuario o de organización). */
export function wipeOnlineCache(): void {
  clearCache(getDb());
  bump();
}

export interface OnlineQuery<T> {
  data: T | null;
  /** Cuándo se bajó (epoch ms). */
  at: number | null;
  /** Lo que se ve es la copia local, no una respuesta de ahora. */
  fromCache: boolean;
  /** No hubo conexión para refrescar. */
  offline: boolean;
  error: { status: number; message: string } | null;
  /** Primera carga sin nada que mostrar todavía. */
  loading: boolean;
  /** Hay algo en pantalla y se está pidiendo la versión nueva. */
  refreshing: boolean;
  reload: (force?: boolean) => void;
}

type Opts = Pick<ReadOptions, "ttlMs" | "forCache"> & { enabled?: boolean };

/**
 * Lee `path` de la API. Muestra de inmediato lo guardado (si hay) y lo refresca si está vencido; con la pantalla otra
 * vez a la vista, al volver la señal o con "deslizar para refrescar" vuelve a pedir.
 */
export function useOnline<T>(path: string | null, o: Opts = {}): OnlineQuery<T> {
  const session = useSession();
  const { online } = useSyncStatus();
  const version = useSyncExternalStore(subscribe, () => cacheVersion);
  const [held, setHeld] = useState<{ key: string; r: ReadResult<T> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const forceNext = useRef(false);
  const first = useRef(true);
  const scope = scopeOf(session);
  const enabled = o.enabled !== false && !!path && !!scope;
  const scopeKey = scope ? `${scope.orgId}:${scope.userId}` : "";
  const key = `${scopeKey}|${path ?? ""}`;
  // Lo que se ve es de esta ruta y esta persona: al cambiar cualquiera de las dos no se muestra lo anterior.
  const result = held?.key === key ? held.r : null;

  useEffect(() => {
    if (!enabled || !path || !scope) return;
    let cancelled = false;
    const db = getDb();
    const force = forceNext.current;
    forceNext.current = false;
    // Lo guardado se ve ya, sin esperar a la red.
    const cached = readCache<T>(db, scope, path);
    if (cached) setHeld((h) => (h?.key === key && h.r.data !== null && !h.r.fromCache ? h : { key, r: { data: cached.body, at: cached.at, fromCache: true, offline: false, error: null } }));
    setBusy(true);
    void readOnline<T>(db, path, () => api<T>("GET", path), { scope, now: Date.now(), ttlMs: o.ttlMs, forCache: o.forCache, force }).then((r) => {
      if (cancelled) return;
      setHeld({ key, r });
      setBusy(false);
    });
    return () => {
      cancelled = true;
    };
    // `online` y `version` fuerzan una nueva lectura al volver la señal o al cambiar datos por una escritura.
  }, [enabled, path, scopeKey, tick, version, online]);

  useFocusEffect(
    useCallback(() => {
      if (first.current) first.current = false;
      else setTick((n) => n + 1);
    }, []),
  );

  const reload = useCallback((force = true) => {
    forceNext.current = force;
    setTick((n) => n + 1);
  }, []);

  return {
    data: result?.data ?? null,
    at: result?.at ?? null,
    fromCache: result?.fromCache ?? false,
    offline: result?.offline ?? false,
    error: result?.error ?? null,
    loading: enabled && result === null,
    refreshing: busy && (result?.data ?? null) !== null,
    reload,
  };
}

export interface OnlineMutation<A extends unknown[], R> {
  run: (...args: A) => Promise<{ ok: true; value: R } | { ok: false }>;
  state: WriteState;
  sending: boolean;
  /** No hay red: el botón debe decir "Necesita conexión". */
  offline: boolean;
  error: string | null;
  reset: () => void;
}

/**
 * Escritura en línea: no corre sin señal, muestra el error del servidor y, al terminar bien, saca de la copia las
 * rutas de `invalidate` para que las pantallas vuelvan a leerlas.
 */
export function useOnlineMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>, o: { invalidate?: string[] } = {}): OnlineMutation<A, R> {
  const { online } = useSyncStatus();
  const [state, setState] = useState<WriteState>({ phase: "idle" });
  const run = useCallback(
    async (...args: A) => {
      const r = await runWrite(online, () => fn(...args), setState);
      if (r.ok && o.invalidate?.length) invalidate(...o.invalidate);
      return r;
    },
    [online, fn, o.invalidate?.join("|")],
  );
  return { run, state, sending: state.phase === "sending", offline: !online, error: state.phase === "error" ? state.message : null, reset: () => setState({ phase: "idle" }) };
}
