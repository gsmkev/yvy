/**
 * P-06: archivado de datos viejos de D1 a R2. Con `ARCHIVE_AFTER_MONTHS` (opcional) el cron diario de mantenimiento
 * mueve, de a pocos por corrida (presupuesto de CPU y de queries), los registros y las estadísticas de vigor más viejos
 * que ese plazo a archivos NDJSON por mes en `archive/<tabla>/AAAA-MM/` del bucket privado de medios, y recién
 * entonces los borra de D1. Restaurar: `node apps/api/scripts/restore-archive.mjs` (ver docs/DEPLOY.md).
 *
 * No se archivan los tipos de registro que el celular y la web leen siempre para sus cuentas (stock de hacienda,
 * historial de siembra, aplicaciones y cosecha): ver KEEP_KINDS.
 */
import { inArray, sql } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { chunkForParams, runBatch, type DB, type Stmt } from "../db/client";
import type { Bindings } from "../types";

export const KEEP_KINDS = [
  "herd_count",
  "herd_move",
  "mortality",
  "health",
  "sowing",
  "application",
  "fertilization",
  "harvest",
] as const;
/** Filas por tanda: cada corrida del cron hace como mucho una tanda por tabla. */
export const ARCHIVE_CHUNK = 100;

export const monthOf = (ms: number): string => new Date(ms).toISOString().slice(0, 7);
const monthStart = (month: string): number => Date.parse(`${month}-01T00:00:00Z`);
const nextMonth = (month: string): number => {
  const d = new Date(monthStart(month));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.getTime();
};

/** Fecha de corte (epoch ms): lo anterior se archiva. null si el archivado no está activado. */
export function archiveCutoff(env: Pick<Bindings, "ARCHIVE_AFTER_MONTHS">, now: number): number | null {
  const months = Number(env.ARCHIVE_AFTER_MONTHS);
  if (!Number.isInteger(months) || months < 3) return null; // por debajo de 3 meses es un error de configuración
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.getTime();
}

const ndjson = (rows: { t: string; row: unknown }[]) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const quoted = (xs: readonly string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);

/** Una tanda de registros (con sus adjuntos y comentarios) del mes más viejo que pasó el corte. */
export async function archiveRecordsChunk(env: Bindings, db: DB, cutoff: number, now: number) {
  const [first] = await db.all<{ at: number | null }>(
    sql`SELECT min(captured_at) AS at FROM records WHERE captured_at < ${cutoff} AND kind NOT IN (${quoted(KEEP_KINDS)})`,
  );
  if (first?.at == null) return null;
  const month = monthOf(first.at);
  const rows = await db.all<Record<string, unknown> & { id: string }>(
    sql`SELECT * FROM records WHERE captured_at >= ${monthStart(month)} AND captured_at < ${Math.min(nextMonth(month), cutoff)}
        AND kind NOT IN (${quoted(KEEP_KINDS)}) ORDER BY id LIMIT ${ARCHIVE_CHUNK}`,
  );
  if (!rows.length) return null;
  const ids = rows.map((r) => r.id);
  const lines: { t: string; row: unknown }[] = rows.map((row) => ({ t: "records", row }));
  const deletes: Stmt[] = [];
  for (const chunk of chunkForParams(ids, 1)) {
    const inIds = sql.join(chunk.map((i) => sql`${i}`), sql`, `);
    for (const t of ["attachments", "comments"] as const)
      for (const row of await db.all(sql`SELECT * FROM ${sql.raw(t)} WHERE record_id IN (${inIds})`)) lines.push({ t, row });
    deletes.push(
      db.delete(s.attachments).where(inArray(s.attachments.recordId, chunk)),
      db.delete(s.comments).where(inArray(s.comments.recordId, chunk)),
      db.delete(s.records).where(inArray(s.records.id, chunk)),
    );
  }
  await env.MEDIA.put(`archive/records/${month}/${now}-${ids[0]}.ndjson`, ndjson(lines));
  await runBatch(db, deletes);
  return { table: "records", month, rows: rows.length };
}

/** Una tanda de estadísticas de vigor del mes más viejo que pasó el corte. */
export async function archiveStatsChunk(env: Bindings, db: DB, cutoff: number, now: number) {
  const [first] = await db.all<{ at: number | null }>(sql`SELECT min(acquired_at) AS at FROM plot_index_stats WHERE acquired_at < ${cutoff}`);
  if (first?.at == null) return null;
  const month = monthOf(first.at);
  const rows = await db.all<Record<string, unknown> & { id: string }>(
    sql`SELECT * FROM plot_index_stats WHERE acquired_at >= ${monthStart(month)} AND acquired_at < ${Math.min(nextMonth(month), cutoff)}
        ORDER BY id LIMIT ${ARCHIVE_CHUNK * 2}`,
  );
  if (!rows.length) return null;
  await env.MEDIA.put(`archive/plot_index_stats/${month}/${now}-${rows[0]!.id}.ndjson`, ndjson(rows.map((row) => ({ t: "plot_index_stats", row }))));
  await runBatch(
    db,
    chunkForParams(rows.map((r) => r.id), 1).map((chunk) =>
      db.delete(s.plotIndexStats).where(inArray(s.plotIndexStats.id, chunk)),
    ),
  );
  return { table: "plot_index_stats", month, rows: rows.length };
}

/** Lo que hace el cron diario: una tanda de cada tabla. Sin ARCHIVE_AFTER_MONTHS no hace nada. */
export async function archiveOld(env: Bindings, db: DB, now: number) {
  const cutoff = archiveCutoff(env, now);
  if (cutoff === null) return [];
  const out = [];
  for (const step of [archiveRecordsChunk, archiveStatsChunk]) {
    const r = await step(env, db, cutoff, now).catch((e) => {
      console.error("archivado", e);
      return null;
    });
    if (r) out.push(r);
  }
  return out;
}
