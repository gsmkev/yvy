/** Servidor simulado con la misma semántica que el Worker: idempotencia por mutationId y cursor (version, id). */
import {
  LIMITS,
  type Cursor,
  type Mutation,
  type PullResponse,
  type PullTable,
  type PushResponse,
  type SyncState,
} from "@yvy/shared";
import type { Transport } from "../src";

export interface Row extends Record<string, unknown> {
  id: string;
  version: number;
  deletedAt: number | null;
}

export class FakeServer {
  version = 0;
  seen = new Set<string>();
  tables = new Map<PullTable, Map<string, Row>>();
  assignmentsVersion = 0;
  pushCalls: number[] = [];

  table(t: PullTable): Map<string, Row> {
    let m = this.tables.get(t);
    if (!m) this.tables.set(t, (m = new Map()));
    return m;
  }

  /** Escritura del lado del servidor (ej. admin crea un lote). */
  write(t: PullTable, row: Record<string, unknown> & { id: string }): void {
    this.version++;
    this.table(t).set(row.id, { deletedAt: null, ...row, version: this.version });
  }

  push(mutations: Mutation[]): PushResponse {
    this.pushCalls.push(mutations.length);
    if (mutations.length > LIMITS.sync.maxMutationsPerPush) throw new Error("lote demasiado grande");
    this.version++;
    return {
      results: mutations.map((m) => {
        if (this.seen.has(m.mutationId)) return { mutationId: m.mutationId, status: "duplicate" as const };
        this.seen.add(m.mutationId);
        const [t] = m.kind.split(".") as [PullTable];
        const tbl = this.table(t);
        if (m.kind.endsWith(".delete")) {
          const r = tbl.get(m.row.id);
          if (r) tbl.set(r.id, { ...r, deletedAt: 1, version: this.version });
        } else {
          tbl.set(m.row.id, {
            ...(m.row as Record<string, unknown>),
            id: m.row.id,
            deletedAt: null,
            version: this.version,
          });
        }
        return { mutationId: m.mutationId, status: "applied" as const };
      }),
    };
  }

  pull(t: PullTable, c: Cursor | null, limit = 50): PullResponse {
    const rows = [...this.table(t).values()]
      .filter((r) => !c || r.version > c.version || (r.version === c.version && r.id > c.id))
      .sort((a, b) => a.version - b.version || (a.id < b.id ? -1 : 1));
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      table: t,
      rows: page,
      cursor: last ? { version: last.version, id: last.id } : null,
      hasMore: rows.length > limit,
    };
  }

  state(): SyncState {
    return {
      userId: "u",
      organizationId: "o",
      role: "worker",
      assignmentsVersion: this.assignmentsVersion,
      serverTime: 0,
    };
  }

  transport(): Transport {
    return {
      state: async () => this.state(),
      push: async (_d, ms) => this.push(structuredClone(ms)),
      pull: async (t, c) => structuredClone(this.pull(t, c)),
    };
  }
}
