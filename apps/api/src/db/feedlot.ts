/**
 * Feedlot (G-33): raciones y resumen por corral con conversión alimenticia. Los suministros son registros `feed`
 * (descuentan stock y cargan costo con el resto del ERP, ver erp-effects.ts); acá solo se leen.
 * Dueño y administrador (como el resto del ERP).
 */
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { corralReport, LIMITS, type FeedEntry, type WeighingEntry } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { chunkForParams } from "./client";
import { can, type ScopedDb } from "./scoped";

/** Todos los productos de la ración tienen que ser del catálogo de la organización. */
export async function requireRationProducts(sdb: ScopedDb, ids: string[]) {
  const unique = [...new Set(ids)];
  let found = 0;
  for (const chunk of chunkForParams(unique, 2)) {
    const rows = await sdb.db
      .select({ id: s.products.id })
      .from(s.products)
      .where(and(eq(s.products.organizationId, sdb.auth.orgId), isNull(s.products.deletedAt), inArray(s.products.id, chunk)));
    found += rows.length;
  }
  return found === unique.length;
}

export async function listRations(sdb: ScopedDb) {
  sdb.require(can.manageErp);
  const rows = await sdb.db
    .select()
    .from(s.feedRations)
    .where(and(eq(s.feedRations.organizationId, sdb.auth.orgId), isNull(s.feedRations.deletedAt)))
    .orderBy(asc(s.feedRations.name));
  return rows.map((r) => ({ id: r.id, name: r.name, note: r.note, items: JSON.parse(r.items) as unknown[] }));
}

export async function feedlotReport(sdb: ScopedDb, f: { farmId?: string; from: number; to: number }) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const r = s.records;
  const base = [eq(r.organizationId, org), isNull(r.deletedAt), isNotNull(r.plotId), gte(r.capturedAt, f.from), lte(r.capturedAt, f.to), f.farmId ? eq(r.farmId, f.farmId) : undefined];
  const [feedRows, weighRows] = await Promise.all([
    sdb.db
      .select({
        plotId: r.plotId,
        at: r.capturedAt,
        kgDm: sql<number>`json_extract(${r.data}, '$.kgDm')`,
        kgAsFed: sql<number>`COALESCE((SELECT SUM(json_extract(j.value, '$.kg')) FROM json_each(${r.data}, '$.items') j), 0)`,
      })
      .from(r)
      .where(and(...base, eq(r.kind, "feed")))
      .limit(LIMITS.erp.exportLimit),
    sdb.db
      .select({ plotId: r.plotId, at: r.capturedAt, kg: sql<number>`json_extract(${r.data}, '$.kg')`, head: sql<number | null>`json_extract(${r.data}, '$.head')` })
      .from(r)
      .where(and(...base, eq(r.kind, "weighing")))
      .limit(LIMITS.erp.exportLimit),
  ]);
  const feeds: FeedEntry[] = feedRows.filter((x) => typeof x.kgDm === "number").map((x) => ({ plotId: x.plotId!, at: x.at, kgDm: x.kgDm, kgAsFed: x.kgAsFed }));
  const corrales = new Set(feeds.map((x) => x.plotId));
  const weighings: WeighingEntry[] = weighRows
    .filter((x) => corrales.has(x.plotId!) && typeof x.kg === "number")
    .map((x) => ({ plotId: x.plotId!, at: x.at, kg: x.kg, head: x.head }));
  const names = new Map<string, string>();
  for (const chunk of chunkForParams([...corrales], 2))
    for (const p of await sdb.db
      .select({ id: s.plots.id, name: s.plots.name })
      .from(s.plots)
      .where(and(eq(s.plots.organizationId, org), inArray(s.plots.id, chunk))))
      names.set(p.id, p.name);
  return {
    truncated: feedRows.length >= LIMITS.erp.exportLimit,
    corrals: corralReport(feeds, weighings).map((c) => ({ ...c, plotName: names.get(c.plotId) ?? "" })),
  };
}
