/** Lo pendiente de mandar tal como lo ve la persona (pantalla Más): conteos, rechazos y mutaciones agrupadas. */
import { type Mutation, type RecordKind } from "@yvy/shared";
import { type OutboxItem, type Ctx } from "./core";

export function pendingCount(db: Ctx): number {
  return db.sql.get<{ n: number }>("SELECT count(*) n FROM outbox WHERE rejected_reason IS NULL")?.n ?? 0;
}

type Pending = { m: Mutation; at: number };
type PhotoTotals = { n: number; bytes: number; at: number };

/** Fotos por registro: las que van en el outbox y las que esperan subir. */
function photosByRecord(db: Ctx, muts: Pending[]): Map<string, PhotoTotals> {
  const photosOf = new Map<string, PhotoTotals>();
  const addPhoto = (recordId: string, bytes: number, at: number) => {
    const p = photosOf.get(recordId) ?? { n: 0, bytes: 0, at };
    photosOf.set(recordId, { n: p.n + 1, bytes: p.bytes + bytes, at: Math.min(p.at, at) });
  };
  for (const { m, at } of muts) if (m.kind === "attachments.upsert") addPhoto(m.row.recordId, m.row.bytes ?? 0, at);
  for (const f of db.sql.all<{ record_id: string; bytes: number | null; created_at: number }>(
    `SELECT a.record_id, a.bytes, a.created_at FROM local_files f JOIN attachments a ON a.id = f.attachment_id
     WHERE f.uploaded = 0 AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.row_id = f.attachment_id)`,
  ))
    addPhoto(f.record_id, f.bytes ?? 0, f.created_at);
  return photosOf;
}

const plain = (m: Mutation, at: number, what: OutboxItem["what"], plotId: string | null = null): OutboxItem => ({
  id: m.mutationId,
  what,
  recordKind: null,
  plotId,
  at,
  photos: 0,
  photoBytes: 0,
});

/** Cómo se ve cada mutación en la lista; las que la persona no necesita ver (adjuntos, comentarios de registro) no figuran. */
function itemOf({ m, at }: Pending, photosOf: Map<string, PhotoTotals>): OutboxItem | null {
  switch (m.kind) {
    case "records.upsert": {
      const p = photosOf.get(m.row.id);
      return { id: m.mutationId, what: "record", recordKind: m.row.kind, plotId: m.row.plotId, at, photos: p?.n ?? 0, photoBytes: p?.bytes ?? 0 };
    }
    case "records.delete":
      return plain(m, at, "record_delete");
    case "plots.upsert":
      return plain(m, at, "plot", m.row.id);
    case "pois.upsert":
      return plain(m, at, "poi");
    case "tasks.status":
    case "tasks.check":
    case "tasks.comment":
      return plain(m, at, "task");
    default:
      return null;
  }
}

/**
 * Lo que falta mandar: mutaciones del outbox (cada registro con el peso de sus fotos) y fotos que
 * el servidor ya conoce pero todavía no se subieron. Más viejo primero.
 */
export function outboxItems(db: Ctx): OutboxItem[] {
  const rows = db.sql.all<{ mutation_id: string; payload: string; created_at: number }>(
    "SELECT mutation_id, payload, created_at FROM outbox WHERE rejected_reason IS NULL ORDER BY mutation_id",
  );
  const muts = rows.map((r) => ({ m: JSON.parse(r.payload) as Mutation, at: r.created_at }));
  const photosOf = photosByRecord(db, muts);
  const items: OutboxItem[] = [];
  const withRecord = new Set<string>();
  for (const pending of muts) {
    const item = itemOf(pending, photosOf);
    if (!item) continue;
    if (pending.m.kind === "records.upsert") withRecord.add(pending.m.row.id);
    items.push(item);
  }
  // Fotos de registros que ya llegaron al servidor.
  for (const [recordId, p] of photosOf) {
    if (withRecord.has(recordId)) continue;
    const rec = db.sql.get<{ kind: RecordKind; plot_id: string | null }>("SELECT kind, plot_id FROM records WHERE id = ?", [recordId]);
    items.push({ id: `photos-${recordId}`, what: "photos", recordKind: rec?.kind ?? null, plotId: rec?.plot_id ?? null, at: p.at, photos: p.n, photoBytes: p.bytes });
  }
  return items.sort((a, b) => a.at - b.at);
}

export function rejected(db: Ctx): { mutationId: string; kind: string; reason: string; detail: string | null }[] {
  return db.sql.all(
    "SELECT mutation_id mutationId, kind, rejected_reason reason, rejected_detail detail FROM outbox WHERE rejected_reason IS NOT NULL",
  );
}

export function dismissRejected(db: Ctx, mutationId: string): void {
  db.sql.run("DELETE FROM outbox WHERE mutation_id = ?", [mutationId]);
}
