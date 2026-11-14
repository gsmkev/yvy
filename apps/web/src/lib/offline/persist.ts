/**
 * Copia de las lecturas de TanStack Query en IndexedDB (ADR 0005), para ver lo ya visitado sin conexión.
 * `buster` = versión de la app + usuario + organización: otra versión o otra persona descarta la copia.
 * Se salta ERP, administración y secretos (policy.ts) y se mantiene bajo LIMITS.webOffline.queryCacheMaxBytes.
 */
import { LIMITS } from "@yvy/shared/limits";
import {
  persistQueryClientRestore,
  persistQueryClientSubscribe,
  type PersistedClient,
  type Persister,
} from "@tanstack/react-query-persist-client";
import type { Query, QueryClient } from "@tanstack/react-query";
import { isPersistableQueryKey } from "../../sw/policy";
import { kvDel, kvGet, kvSet } from "./db";

const KEY = "rq:cache";

/** Compilada con la build (vite.config.ts); en tests vale "test". */
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

export const bustFor = (s: { user: { id: string }; organization: { id: string } } | null): string =>
  `${APP_VERSION}:${s?.user.id ?? "-"}:${s?.organization.id ?? "-"}`;

export const shouldPersist = (q: Pick<Query, "queryKey" | "state">): boolean =>
  q.state.status === "success" && isPersistableQueryKey(q.queryKey);

const sizeOf = (v: unknown): number => {
  try {
    return JSON.stringify(v)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY; // lo que no se puede serializar no se guarda
  }
};

/** Saca las consultas más pesadas hasta que la copia entre en el tope. Devuelve la copia y cuántas sacó. */
export function fitToBudget(client: PersistedClient, maxBytes: number): { client: PersistedClient; dropped: number } {
  const sized = client.clientState.queries.map((q) => ({ q, size: sizeOf(q.state.data) }));
  let total = sized.reduce((a, x) => a + x.size, 0);
  if (total <= maxBytes) return { client, dropped: 0 };
  const byWeight = [...sized].sort((a, b) => b.size - a.size);
  const out = new Set<unknown>();
  for (const x of byWeight) {
    if (total <= maxBytes) break;
    out.add(x.q);
    total -= x.size;
  }
  return {
    client: { ...client, clientState: { ...client.clientState, queries: client.clientState.queries.filter((q) => !out.has(q)) } },
    dropped: out.size,
  };
}

/** Persister sobre IndexedDB. Escribe a lo sumo una vez por `throttleMs` (con la última versión). */
export function createIdbPersister(opts: { throttleMs?: number; maxBytes?: number } = {}): Persister & { flush(): Promise<void> } {
  const throttleMs = opts.throttleMs ?? LIMITS.webOffline.persistThrottleMs;
  const maxBytes = opts.maxBytes ?? LIMITS.webOffline.queryCacheMaxBytes;
  let latest: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing: Promise<void> = Promise.resolve();

  const write = async () => {
    timer = null;
    const c = latest;
    latest = null;
    if (!c) return;
    const { client } = fitToBudget(c, maxBytes);
    try {
      await kvSet(KEY, client);
    } catch {
      // Sin lugar o IndexedDB bloqueada: se sigue sin copia. Las pantallas no se enteran.
    }
  };

  return {
    persistClient(client) {
      latest = client;
      timer ??= setTimeout(() => {
        writing = writing.then(write);
      }, throttleMs);
    },
    async restoreClient() {
      try {
        return await kvGet<PersistedClient>(KEY);
      } catch {
        return undefined;
      }
    },
    async removeClient() {
      latest = null;
      if (timer) clearTimeout(timer);
      timer = null;
      await writing.catch(() => {});
      try {
        await kvDel(KEY);
      } catch {
        /* nada que borrar */
      }
    },
    async flush() {
      if (timer) clearTimeout(timer);
      writing = writing.then(write);
      await writing;
    },
  };
}

export interface QueryPersistence {
  persister: ReturnType<typeof createIdbPersister>;
  /** Restaura la copia para el `buster` dado y empieza a guardar. */
  start(buster: string): Promise<void>;
  stop(): void;
}

export function queryPersistence(queryClient: QueryClient, persister = createIdbPersister()): QueryPersistence {
  let unsubscribe: (() => void) | null = null;
  const maxAge = LIMITS.webOffline.queryCacheMaxAgeMs;
  return {
    persister,
    async start(buster) {
      unsubscribe?.();
      await persistQueryClientRestore({ queryClient, persister, maxAge, buster });
      unsubscribe = persistQueryClientSubscribe({
        queryClient,
        persister,
        buster,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
      });
    },
    stop() {
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}
