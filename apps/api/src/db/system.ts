/**
 * Acceso de sistema (sin usuario): /ingest firmado por HMAC y crons. Única excepción a scopedDb.
 * Cada escritura deriva organization_id de la fila padre (lote o estancia), nunca del request.
 */
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, chunkForParams, currentVersion, runBatch, type DB, type Stmt } from "./client";

export class SystemDb {
  constructor(readonly db: DB) {}

  activeFarms() {
    return this.db
      .select({
        id: s.farms.id,
        organizationId: s.farms.organizationId,
        name: s.farms.name,
        centroidLon: s.farms.centroidLon,
        centroidLat: s.farms.centroidLat,
        minLon: s.farms.minLon,
        minLat: s.farms.minLat,
        maxLon: s.farms.maxLon,
        maxLat: s.farms.maxLat,
      })
      .from(s.farms)
      .where(isNull(s.farms.deletedAt));
  }

  farmGeometry(farmId: string) {
    return this.db
      .select({
        farm: s.farms.geometry,
        plots: sql<string>`(SELECT json_group_array(json_object('id', id, 'kind', kind, 'crop', crop, 'geometry', json(geometry))) FROM plots WHERE farm_id = ${farmId} AND deleted_at IS NULL)`,
      })
      .from(s.farms)
      .where(eq(s.farms.id, farmId))
      .limit(1);
  }

  async upsertScene(x: {
    source: string;
    itemId: string;
    acquiredAt: number;
    cloudPct: number | null;
  }): Promise<string> {
    const [row] = await this.db
      .insert(s.scenes)
      .values({ id: newId(), ...x, processedAt: Date.now() })
      .onConflictDoUpdate({ target: [s.scenes.source, s.scenes.itemId], set: { processedAt: Date.now() } })
      .returning({ id: s.scenes.id });
    return row!.id;
  }

  async upsertIndexStats(
    rows: {
      plotId: string;
      sceneId: string;
      acquiredAt: number;
      idx: string;
      mean: number;
      p10: number;
      p90: number;
      validPct: number;
    }[],
  ): Promise<{ written: number; unknownPlots: string[] }> {
    const plots = await this.db
      .select({ id: s.plots.id, org: s.plots.organizationId })
      .from(s.plots)
      .where(inArray(s.plots.id, [...new Set(rows.map((r) => r.plotId))]));
    const orgOf = new Map(plots.map((p) => [p.id, p.org]));
    const ts = Date.now();
    const valid = rows.filter((r) => orgOf.has(r.plotId));
    const stmts: Stmt[] = [bumpVersion(this.db)];
    for (const chunk of chunkForParams(valid, 15)) {
      stmts.push(
        this.db
          .insert(s.plotIndexStats)
          .values(
            chunk.map((r) => ({
              ...r,
              id: newId(),
              organizationId: orgOf.get(r.plotId)!,
              createdAt: ts,
              updatedAt: ts,
              version: currentVersion,
            })),
          )
          .onConflictDoUpdate({
            target: [s.plotIndexStats.plotId, s.plotIndexStats.sceneId, s.plotIndexStats.idx],
            set: {
              mean: sql`excluded.mean`,
              p10: sql`excluded.p10`,
              p90: sql`excluded.p90`,
              validPct: sql`excluded.valid_pct`,
              updatedAt: ts,
              version: currentVersion,
            },
          }),
      );
    }
    if (valid.length) await runBatch(this.db, stmts);
    return { written: valid.length, unknownPlots: rows.filter((r) => !orgOf.has(r.plotId)).map((r) => r.plotId) };
  }

  async upsertClimateDaily(rows: (typeof s.climateDaily.$inferInsert)[]): Promise<number> {
    const stmts = chunkForParams(rows, 9).map((chunk) =>
      this.db
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
    await runBatch(this.db, stmts);
    return rows.length;
  }

  async addFarmLayer(x: {
    farmId: string;
    layer: "true_color" | "ndvi";
    acquiredAt: number;
    pmtilesPath: string;
    bytes: number;
    bounds: string;
  }) {
    const [farm] = await this.db
      .select({ org: s.farms.organizationId })
      .from(s.farms)
      .where(eq(s.farms.id, x.farmId))
      .limit(1);
    if (!farm) return null;
    const id = newId();
    const ts = Date.now();
    await runBatch(this.db, [
      bumpVersion(this.db),
      this.db
        .insert(s.farmLayers)
        .values({ ...x, id, organizationId: farm.org, createdAt: ts, updatedAt: ts, version: currentVersion }),
      this.db
        .update(s.farms)
        .set({ offlinePackVersion: sql`${s.farms.offlinePackVersion} + 1`, updatedAt: ts, version: currentVersion })
        .where(eq(s.farms.id, x.farmId)),
    ]);
    return { id };
  }

  /** Mantenimiento diario: borra códigos y tokens vencidos. */
  async purgeExpiredAuth(now = Date.now()): Promise<void> {
    await runBatch(this.db, [
      this.db.delete(s.emailCodes).where(lt(s.emailCodes.expiresAt, now)),
      this.db.delete(s.linkCodes).where(or(lt(s.linkCodes.expiresAt, now), sql`${s.linkCodes.usedAt} IS NOT NULL`)),
      this.db
        .delete(s.refreshTokens)
        .where(
          or(
            lt(s.refreshTokens.expiresAt, now),
            and(sql`${s.refreshTokens.revokedAt} IS NOT NULL`, lt(s.refreshTokens.revokedAt, now - 86_400_000)),
          ),
        ),
    ]);
  }
}
