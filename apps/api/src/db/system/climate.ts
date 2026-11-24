/** Clima: datos diarios, climatología, índice SPI y riesgo climático. */
import { and, eq, isNull, sql } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { chunkForParams, runBatch } from "../client";
import type { SystemDb } from "./index";

export async function upsertClimateDaily(sys: SystemDb, rows: (typeof s.climateDaily.$inferInsert)[]): Promise<number> {
  const stmts = chunkForParams(rows, 9).map((chunk) =>
    sys.db
      .insert(s.climateDaily)
      .values(chunk)
      .onConflictDoUpdate({
        target: [s.climateDaily.farmId, s.climateDaily.plotId, s.climateDaily.date, s.climateDaily.source],
        set: {
          precipMm: sql`excluded.precip_mm`,
          tminC: sql`excluded.tmin_c`,
          tmaxC: sql`excluded.tmax_c`,
          soilMoisture0_7: sql`excluded.soil_moisture_0_7`,
          soilMoisture7_28: sql`excluded.soil_moisture_7_28`,
        },
      }),
  );
  await runBatch(sys.db, stmts);
  return rows.length;
}

export function climateLatest(sys: SystemDb) {
  return sys.db
    .select({
      farmId: s.climateDaily.farmId,
      source: s.climateDaily.source,
      latest: sql<string>`max(${s.climateDaily.date})`,
    })
    .from(s.climateDaily)
    .where(eq(s.climateDaily.plotId, ""))
    .groupBy(s.climateDaily.farmId, s.climateDaily.source);
}

export async function upsertClimatology(sys: SystemDb, rows: (typeof s.climatology.$inferInsert)[]): Promise<number> {
  const stmts = chunkForParams(rows, 8).map((chunk) =>
    sys.db
      .insert(s.climatology)
      .values(chunk)
      .onConflictDoUpdate({
        target: [s.climatology.farmId, s.climatology.plotId, s.climatology.dayOfYear, s.climatology.variable],
        set: { p20: sql`excluded.p20`, p50: sql`excluded.p50`, p80: sql`excluded.p80`, mean: sql`excluded.mean` },
      }),
  );
  await runBatch(sys.db, stmts);
  return rows.length;
}

/** C-07: guarda (reemplaza) el SPI de la estancia. */
export async function upsertFarmSpi(sys: SystemDb, farmId: string, report: string, now: number): Promise<boolean> {
  const [f] = await sys.db
    .select({ id: s.farms.id })
    .from(s.farms)
    .where(and(eq(s.farms.id, farmId), isNull(s.farms.deletedAt)))
    .limit(1);
  if (!f) return false;
  await sys.db
    .insert(s.farmSpi)
    .values({ farmId, computedAt: now, report })
    .onConflictDoUpdate({ target: s.farmSpi.farmId, set: { computedAt: now, report } });
  return true;
}

export async function upsertFarmRisk(sys: SystemDb, farmId: string, report: string, now: number): Promise<boolean> {
  const [f] = await sys.db
    .select({ id: s.farms.id })
    .from(s.farms)
    .where(and(eq(s.farms.id, farmId), isNull(s.farms.deletedAt)))
    .limit(1);
  if (!f) return false;
  await sys.db
    .insert(s.farmRisk)
    .values({ farmId, computedAt: now, report })
    .onConflictDoUpdate({ target: s.farmRisk.farmId, set: { computedAt: now, report } });
  return true;
}
