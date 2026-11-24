/** Comparación anónima con la zona. */
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { chunkForParams } from "../client";
import type { SystemDb } from "./index";

/** Estancias de OTRAS organizaciones dentro de la caja, con su centro. Solo para calcular medianas. */
export function benchmarkCandidates(sys: SystemDb, orgId: string, box: { minLon: number; maxLon: number; minLat: number; maxLat: number }) {
  return sys.db
    .select({ id: s.farms.id, organizationId: s.farms.organizationId, lon: s.farms.centroidLon, lat: s.farms.centroidLat })
    .from(s.farms)
    .where(
      and(
        isNull(s.farms.deletedAt),
        sql`${s.farms.organizationId} <> ${orgId}`,
        gte(s.farms.centroidLon, box.minLon),
        lte(s.farms.centroidLon, box.maxLon),
        gte(s.farms.centroidLat, box.minLat),
        lte(s.farms.centroidLat, box.maxLat),
      ),
    )
    .limit(2000);
}

/**
 * Vigor medio (NDVI de los lotes desde `since`) y lluvia acumulada (CHIRPS desde `sinceDate`) por estancia.
 * 2 consultas por tanda de ≤ 90 estancias.
 */
export async function benchmarkMetrics(sys: SystemDb, farmIds: string[], since: number, sinceDate: string) {
  const out = new Map<string, { ndvi: number | null; rainMm: number | null }>();
  for (const ids of chunkForParams(farmIds, 1)) {
    const list = sql.join(ids.map((i) => sql`${i}`), sql`, `);
    const ndvi = await sys.db.all<{ farm_id: string; v: number }>(
      sql`SELECT p.farm_id AS farm_id, AVG(st.mean) AS v FROM plot_index_stats st JOIN plots p ON p.id = st.plot_id
          WHERE p.farm_id IN (${list}) AND st.idx = 'ndvi' AND st.acquired_at >= ${since}
            AND st.deleted_at IS NULL AND p.deleted_at IS NULL GROUP BY p.farm_id`,
    );
    // chirps y chirps_prelim pueden repetir el día: se cuenta una vez por día
    const rain = await sys.db.all<{ farm_id: string; v: number }>(
      sql`SELECT farm_id, SUM(mm) AS v FROM (
            SELECT farm_id, date, MAX(precip_mm) AS mm FROM climate_daily
            WHERE farm_id IN (${list}) AND plot_id = '' AND source IN ('chirps', 'chirps_prelim')
              AND date >= ${sinceDate} AND precip_mm IS NOT NULL GROUP BY farm_id, date
          ) GROUP BY farm_id`,
    );
    for (const id of ids) out.set(id, { ndvi: null, rainMm: null });
    for (const r of ndvi) out.get(r.farm_id)!.ndvi = r.v;
    for (const r of rain) out.get(r.farm_id)!.rainMm = r.v;
  }
  return out;
}

/** Guarda (reemplaza) la comparación de una estancia con su zona. */
export async function saveBenchmark(sys: SystemDb, row: typeof s.zoneBenchmarks.$inferInsert) {
  await sys.db
    .insert(s.zoneBenchmarks)
    .values(row)
    .onConflictDoUpdate({ target: s.zoneBenchmarks.farmId, set: row });
}

/** Borra la comparación de zona de una estancia. */
export async function clearBenchmark(sys: SystemDb, farmId: string) {
  await sys.db.delete(s.zoneBenchmarks).where(eq(s.zoneBenchmarks.farmId, farmId));
}
