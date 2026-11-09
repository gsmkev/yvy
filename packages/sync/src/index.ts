/**
 * Motor de sincronización del cliente (PRD §11), TS puro: la app implementa SyncStore sobre
 * expo-sqlite y los tests lo implementan en memoria.
 *
 * Un ciclo: estado → push (outbox) → pull (por tabla) → fotos. Un solo ciclo a la vez.
 * - La escritura local + su mutación en el outbox van en una transacción (lo hace la app).
 * - Push en lotes de ≤ LIMITS.sync.maxMutationsPerPush; ante límite de CPU (1102/503) el lote se divide.
 * - Idempotencia: el servidor ignora mutationId repetidos, así que reintentar siempre es seguro.
 * - Si cambian las asignaciones del empleado, se rehacen las tablas que dependen de ellas.
 * - El reloj del celular no interviene: los cursores los asigna el servidor.
 */
import {
  ASSIGNMENT_SCOPED_TABLES,
  LIMITS,
  PULL_TABLES,
  type Cursor,
  type Mutation,
  type PullResponse,
  type PullTable,
  type PushResponse,
  type RejectReason,
  type SyncState,
} from "@yvy/shared";

export interface SyncStore {
  /** Mutaciones pendientes en orden de creación, sin las rechazadas. */
  pendingMutations(limit: number): Promise<Mutation[]>;
  /** Saca del outbox las aplicadas o duplicadas. */
  removeMutations(mutationIds: string[]): Promise<void>;
  /** Marca rechazadas: no se reintentan y la app las muestra con aviso. */
  markRejected(rejections: { mutationId: string; reason: RejectReason; detail?: string }[]): Promise<void>;
  getCursor(table: PullTable): Promise<Cursor | null>;
  /** Aplica filas del servidor y guarda el cursor en la misma transacción. */
  applyPull(table: PullTable, rows: Record<string, unknown>[], cursor: Cursor | null): Promise<void>;
  getAssignmentsVersion(): Promise<number | null>;
  setAssignmentsVersion(v: number): Promise<void>;
  /** Borra las filas locales de esas tablas (salvo lo pendiente en el outbox) y sus cursores. */
  resetTables(tables: readonly PullTable[]): Promise<void>;
}

export interface Transport {
  state(): Promise<SyncState>;
  push(deviceId: string, mutations: Mutation[]): Promise<PushResponse>;
  pull(table: PullTable, cursor: Cursor | null): Promise<PullResponse>;
}

/** Subida de fotos; la implementa la app (URL firmada a R2 + marcar subida). */
export interface AttachmentUploader {
  /** Sube lo pendiente; devuelve cuántas subió. No debe lanzar por una foto fallida. */
  uploadPending(): Promise<number>;
}

export class CpuLimitError extends Error {
  constructor() {
    super("El servidor superó el límite de CPU");
  }
}

export type SyncPhase = "idle" | "syncing";

export interface SyncReport {
  pushed: number;
  rejected: number;
  pulled: Partial<Record<PullTable, number>>;
  reset: boolean;
  uploaded: number;
  finishedAt: number;
}

export class SyncEngine {
  private batchSize: number = LIMITS.sync.maxMutationsPerPush;
  private running: Promise<SyncReport> | null = null;

  constructor(
    private readonly opts: {
      store: SyncStore;
      transport: Transport;
      deviceId: string;
      uploader?: AttachmentUploader;
      now?: () => number;
    },
  ) {}

  get phase(): SyncPhase {
    return this.running ? "syncing" : "idle";
  }

  get currentBatchSize(): number {
    return this.batchSize;
  }

  /** Llamadas concurrentes comparten el mismo ciclo. */
  sync(): Promise<SyncReport> {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<SyncReport> {
    const { store, transport } = this.opts;
    const report: SyncReport = { pushed: 0, rejected: 0, pulled: {}, reset: false, uploaded: 0, finishedAt: 0 };

    const state = await transport.state();
    // Push antes del reset: lo pendiente del outbox nunca se pierde.
    await this.pushAll(report);

    const known = await store.getAssignmentsVersion();
    if (known !== null && known !== state.assignmentsVersion) {
      await store.resetTables(ASSIGNMENT_SCOPED_TABLES);
      report.reset = true;
    }
    for (const table of PULL_TABLES) report.pulled[table] = await this.pullTable(table);
    await store.setAssignmentsVersion(state.assignmentsVersion);

    if (this.opts.uploader) report.uploaded = await this.opts.uploader.uploadPending();
    report.finishedAt = (this.opts.now ?? Date.now)();
    return report;
  }

  private async pushAll(report: SyncReport): Promise<void> {
    const { store, transport, deviceId } = this.opts;
    for (;;) {
      const batch = await store.pendingMutations(this.batchSize);
      if (batch.length === 0) return;
      let res: PushResponse;
      try {
        res = await transport.push(deviceId, batch);
      } catch (err) {
        if (err instanceof CpuLimitError && this.batchSize > LIMITS.sync.minMutationsPerPush) {
          this.batchSize = Math.max(
            LIMITS.sync.minMutationsPerPush,
            Math.floor(this.batchSize / LIMITS.sync.backoffDivisor),
          );
          continue;
        }
        throw err;
      }
      const done: string[] = [];
      const rejected: { mutationId: string; reason: RejectReason; detail?: string }[] = [];
      for (const r of res.results) {
        if (r.status === "rejected") rejected.push({ mutationId: r.mutationId, reason: r.reason, detail: r.detail });
        else done.push(r.mutationId);
      }
      if (done.length) await store.removeMutations(done);
      if (rejected.length) await store.markRejected(rejected);
      report.pushed += done.length;
      report.rejected += rejected.length;
      if (done.length + rejected.length === 0) throw new Error("El servidor no procesó el lote");
    }
  }

  private async pullTable(table: PullTable): Promise<number> {
    const { store, transport } = this.opts;
    let total = 0;
    let cursor = await store.getCursor(table);
    for (;;) {
      const page = await transport.pull(table, cursor);
      const next = page.cursor ?? cursor;
      await store.applyPull(table, page.rows, next);
      total += page.rows.length;
      cursor = next;
      if (!page.hasMore) return total;
    }
  }
}

/** Texto del indicador de estado (RF-43). */
export const syncStatusLabel = (
  s: { online: boolean; phase: SyncPhase; pending: number; lastSyncAt: number | null },
  fmtTime: (ms: number) => string,
): { key: "offline" | "syncing" | "synced"; vars: Record<string, string | number> } => {
  if (s.phase === "syncing") return { key: "syncing", vars: {} };
  if (!s.online || s.pending > 0) return { key: "offline", vars: { count: s.pending } };
  return { key: "synced", vars: { time: s.lastSyncAt ? fmtTime(s.lastSyncAt) : "—" } };
};

/** Transporte HTTP contra el Worker. */
export const httpTransport = (opts: {
  baseUrl: string;
  getAccessToken: () => Promise<string>;
  fetch?: typeof fetch;
}): Transport => {
  const f = opts.fetch ?? fetch;
  const call = async <T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> => {
    const res = await f(`${opts.baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${await opts.getAccessToken()}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 503 || res.headers.get("cf-error-code") === "1102") throw new CpuLimitError();
    if (!res.ok) throw new Error(`sync ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  };
  return {
    state: () => call<SyncState>("GET", "/sync/state"),
    push: (deviceId, mutations) => call<PushResponse>("POST", "/sync/push", { deviceId, mutations }),
    pull: (table, cursor) => call<PullResponse>("POST", "/sync/pull", { table, cursor }),
  };
};
