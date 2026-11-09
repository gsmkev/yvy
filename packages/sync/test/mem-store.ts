import type { Cursor, Mutation, PullTable, RejectReason } from "@yvy/shared";
import type { SyncStore } from "../src";

/** Store en memoria que imita la app: tablas locales + outbox + cursores. */
export class MemStore implements SyncStore {
  outbox: Mutation[] = [];
  rejected = new Map<string, RejectReason>();
  cursors = new Map<PullTable, Cursor | null>();
  tables = new Map<PullTable, Map<string, Record<string, unknown>>>();
  assignmentsVersion: number | null = null;
  resets: PullTable[][] = [];

  /** Escritura local + mutación en el outbox (en la app, en una transacción). */
  enqueue(m: Mutation): void {
    this.outbox.push(m);
  }
  async pendingMutations(limit: number) {
    return this.outbox.filter((m) => !this.rejected.has(m.mutationId)).slice(0, limit);
  }
  async removeMutations(ids: string[]) {
    const set = new Set(ids);
    this.outbox = this.outbox.filter((m) => !set.has(m.mutationId));
  }
  async markRejected(r: { mutationId: string; reason: RejectReason }[]) {
    for (const x of r) this.rejected.set(x.mutationId, x.reason);
  }
  async getCursor(t: PullTable) {
    return this.cursors.get(t) ?? null;
  }
  async applyPull(t: PullTable, rows: Record<string, unknown>[], c: Cursor | null) {
    let m = this.tables.get(t);
    if (!m) this.tables.set(t, (m = new Map()));
    for (const r of rows) m.set(r.id as string, r);
    this.cursors.set(t, c);
  }
  async getAssignmentsVersion() {
    return this.assignmentsVersion;
  }
  async setAssignmentsVersion(v: number) {
    this.assignmentsVersion = v;
  }
  async resetTables(ts: readonly PullTable[]) {
    this.resets.push([...ts]);
    for (const t of ts) {
      this.tables.delete(t);
      this.cursors.delete(t);
    }
  }
  live(t: PullTable) {
    return [...(this.tables.get(t)?.values() ?? [])].filter((r) => !r.deletedAt);
  }
}
