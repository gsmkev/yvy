/** Listado de registros (RF-35). */
import { and, desc, eq, gte, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { RecordKind } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import type { ScopedDb } from "../scoped";

// ---------- Registros (RF-35) ----------

export interface RecordFilters {
  farmId?: string;
  plotId?: string;
  authorId?: string;
  kind?: RecordKind;
  from?: number;
  to?: number;
  cursor?: { capturedAt: number; id: string };
  limit?: number;
}

export async function listRecords(sdb: ScopedDb, f: RecordFilters) {
  const limit = Math.min(f.limit ?? 50, 500);
  const conds: (SQL | undefined)[] = [
    eq(s.records.organizationId, sdb.auth.orgId),
    isNull(s.records.deletedAt),
    sdb.workerFilter("records"),
    f.farmId ? eq(s.records.farmId, f.farmId) : undefined,
    f.plotId ? eq(s.records.plotId, f.plotId) : undefined,
    f.authorId ? eq(s.records.authorId, f.authorId) : undefined,
    f.kind ? eq(s.records.kind, f.kind) : undefined,
    f.from ? gte(s.records.capturedAt, f.from) : undefined,
    f.to ? lte(s.records.capturedAt, f.to) : undefined,
    f.cursor
      ? or(
          lt(s.records.capturedAt, f.cursor.capturedAt),
          and(eq(s.records.capturedAt, f.cursor.capturedAt), lt(s.records.id, f.cursor.id)),
        )
      : undefined,
  ];
  const rows = await sdb.db
    .select({
      record: s.records,
      authorName: s.users.fullName,
      plotName: s.plots.name,
      attachments: sql<string>`(SELECT json_group_array(json_object('id', a.id, 'uploadStatus', a.upload_status, 'mime', a.mime)) FROM attachments a WHERE a.record_id = ${s.records.id} AND a.deleted_at IS NULL)`,
    })
    .from(s.records)
    .leftJoin(s.users, eq(s.users.id, s.records.authorId))
    .leftJoin(s.plots, eq(s.plots.id, s.records.plotId))
    .where(and(...conds))
    .orderBy(desc(s.records.capturedAt), desc(s.records.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit).map((r) => ({
    ...r.record,
    data: JSON.parse(r.record.data) as unknown,
    authorName: r.authorName,
    plotName: r.plotName,
    attachments: JSON.parse(r.attachments) as { id: string; uploadStatus: string; mime?: string }[],
  }));
  const last = page[page.length - 1];
  return { rows: page, nextCursor: rows.length > limit && last ? { capturedAt: last.capturedAt, id: last.id } : null };
}
