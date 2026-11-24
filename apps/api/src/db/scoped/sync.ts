/** Sincronización (pull) y adjuntos. */
import { and, asc, eq, gt, gte, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { LIMITS, TAGGED_RECORD_KINDS, type Cursor, type PullResponse, type PullTable, type SyncState } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, currentVersion, runBatch } from "../client";
import type { ScopedDb } from "./index";
import { NotFoundError } from "./permissions";
import { SYNCED } from "./synced-tables";

/** Ventana de historial que baja al celular. */
function historyFilter(sdb: ScopedDb, table: PullTable): SQL | undefined {
  const now = sdb.now();
  // Hacienda: todos los conteos y un año de movimientos y mortandad, para calcular el stock en el celular.
  if (table === "records")
    return or(
      gte(s.records.capturedAt, now - LIMITS.sync.recordsHistoryMs),
      eq(s.records.kind, "herd_count"),
      and(
        inArray(s.records.kind, ["herd_move", "mortality", "theft"]),
        gte(s.records.capturedAt, now - LIMITS.sync.herdEventsHistoryMs),
      ),
      // Lo que lleva la caravana de un animal baja un año, para ver su historial sin señal.
      and(
        inArray(s.records.kind, [...TAGGED_RECORD_KINDS]),
        sql`json_extract(${s.records.data}, '$.tag') IS NOT NULL`,
        gte(s.records.capturedAt, now - LIMITS.sync.herdEventsHistoryMs),
      ),
    );
  if (table === "attachments") return gte(s.attachments.createdAt, now - LIMITS.sync.recordsHistoryMs);
  if (table === "plot_index_stats") return gte(s.plotIndexStats.acquiredAt, now - LIMITS.sync.indexStatsHistoryMs);
  // B7: tareas abiertas, o cerradas/canceladas hace menos de 30 días.
  if (table === "tasks")
    return or(
      eq(s.tasks.status, "open"),
      gte(sql`coalesce(${s.tasks.completedAt}, ${s.tasks.updatedAt})`, now - LIMITS.sync.tasksDoneHistoryMs),
    );
  return undefined;
}

/** Estado de sincronización de la persona: identidad, rol, versión de asignaciones y hora del servidor. */
export async function syncState(sdb: ScopedDb): Promise<SyncState> {
  const [m] = await sdb.db
    .select({ v: s.memberships.assignmentsVersion })
    .from(s.memberships)
    .where(and(eq(s.memberships.organizationId, sdb.auth.orgId), eq(s.memberships.userId, sdb.auth.userId)))
    .limit(1);
  return {
    userId: sdb.auth.userId,
    organizationId: sdb.auth.orgId,
    role: sdb.auth.role,
    assignmentsVersion: m?.v ?? 0,
    serverTime: sdb.now(),
  };
}

/**
 * Una página de filas de una tabla sincronizable posteriores al cursor (versión, id), ya filtradas por visibilidad.
 */
export async function pull(sdb: ScopedDb, table: PullTable, cursor: Cursor | null, limit: number = LIMITS.sync.pullPageSize): Promise<PullResponse> {
  const t = SYNCED[table];
  const after = cursor
    ? or(gt(t.version, cursor.version), and(eq(t.version, cursor.version), gt(t.id, cursor.id)))
    : undefined;
  const rows = (await sdb.db
    .select()
    .from(t.table)
    .where(and(eq(t.org, sdb.auth.orgId), sdb.workerFilter(table), historyFilter(sdb, table), after))
    .orderBy(asc(t.version), asc(t.id))
    .limit(limit + 1)) as (Record<string, unknown> & { id: string; version: number })[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return { table, rows: page, cursor: last ? { version: last.version, id: last.id } : null, hasMore };
}

/** Adjunto de la organización. Falla con NotFoundError si no existe o se borró. */
export async function getAttachment(sdb: ScopedDb, id: string) {
  const [row] = await sdb.db
    .select({ a: s.attachments })
    .from(s.attachments)
    .where(
      and(
        eq(s.attachments.id, id),
        eq(s.attachments.organizationId, sdb.auth.orgId),
        isNull(s.attachments.deletedAt),
        sdb.workerFilter("attachments"),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Foto inexistente");
  return row.a;
}

/** Marca un adjunto como subido a R2 y le suma versión para que baje al resto de los dispositivos. */
export async function markAttachmentUploaded(sdb: ScopedDb, id: string, bytes: number | null): Promise<void> {
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db
      .update(s.attachments)
      .set({ uploadStatus: "uploaded", updatedAt: ts, version: currentVersion, ...(bytes ? { bytes } : {}) })
      .where(and(eq(s.attachments.id, id), eq(s.attachments.organizationId, sdb.auth.orgId))),
  ]);
}
