/**
 * Acceso de sistema (sin usuario): /ingest firmado por HMAC y crons. Única excepción a scopedDb.
 * Cada escritura deriva organization_id de la fila padre (lote o estancia), nunca del request.
 */
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { upsertAlert } from "../jobs/alerts";
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
        hasClimatology: sql<boolean>`EXISTS (SELECT 1 FROM climatology c WHERE c.farm_id = farms.id)`,
        hasBasemap: sql<boolean>`EXISTS (SELECT 1 FROM farm_layers l WHERE l.farm_id = farms.id AND l.layer = 'true_color' AND l.deleted_at IS NULL)`,
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

  /** Registra la escena. `processed` indica si ya se cargaron sus estadísticas. */
  async upsertScene(x: {
    source: string;
    itemId: string;
    acquiredAt: number;
    cloudPct: number | null;
  }): Promise<{ id: string; processed: boolean }> {
    const [row] = await this.db
      .insert(s.scenes)
      .values({ id: newId(), ...x })
      .onConflictDoUpdate({ target: [s.scenes.source, s.scenes.itemId], set: { cloudPct: sql`excluded.cloud_pct` } })
      .returning({ id: s.scenes.id, processedAt: s.scenes.processedAt });
    return { id: row!.id, processed: row!.processedAt !== null };
  }

  async markSceneProcessed(id: string): Promise<void> {
    await this.db.update(s.scenes).set({ processedAt: Date.now() }).where(eq(s.scenes.id, id));
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

  async upsertClimatology(rows: (typeof s.climatology.$inferInsert)[]): Promise<number> {
    const stmts = chunkForParams(rows, 8).map((chunk) =>
      this.db
        .insert(s.climatology)
        .values(chunk)
        .onConflictDoUpdate({
          target: [s.climatology.farmId, s.climatology.plotId, s.climatology.dayOfYear, s.climatology.variable],
          set: { p20: sql`excluded.p20`, p50: sql`excluded.p50`, p80: sql`excluded.p80`, mean: sql`excluded.mean` },
        }),
    );
    await runBatch(this.db, stmts);
    return rows.length;
  }

  async fireAlert(x: {
    farmId: string;
    date: string;
    severity: "watch" | "warning";
    minDistanceKm: number;
    windTowardsFarm?: boolean;
    hotspots: {
      lon: number;
      lat: number;
      acquiredAt: number;
      confidence: string | null;
      frp: number | null;
      source: string;
    }[];
  }) {
    const [farm] = await this.db
      .select({ id: s.farms.id, organizationId: s.farms.organizationId })
      .from(s.farms)
      .where(and(eq(s.farms.id, x.farmId), isNull(s.farms.deletedAt)))
      .limit(1);
    if (!farm) return null;
    if (x.hotspots.length) {
      await runBatch(
        this.db,
        chunkForParams(x.hotspots, 7).map((chunk) =>
          this.db
            .insert(s.fireHotspots)
            .values(
              chunk.map((h) => ({ ...h, id: `${h.source}:${h.acquiredAt}:${h.lon.toFixed(4)}:${h.lat.toFixed(4)}` })),
            )
            .onConflictDoNothing(),
        ),
      );
    }
    // RF-70: alto si el viento pronosticado sopla desde el foco hacia la estancia a > 25 km/h.
    let severity = x.severity;
    let windTowardsFarm = !!x.windTowardsFarm;
    const [wind] = await this.db
      .select({
        kmh: s.forecasts.windKmh,
        dir: s.forecasts.windDirDeg,
        lon: s.farms.centroidLon,
        lat: s.farms.centroidLat,
      })
      .from(s.forecasts)
      .innerJoin(s.farms, eq(s.farms.id, s.forecasts.farmId))
      .where(and(eq(s.forecasts.farmId, x.farmId), eq(s.forecasts.validDate, x.date)))
      .orderBy(desc(s.forecasts.runAt))
      .limit(1);
    if (wind?.kmh && wind.dir !== null && wind.kmh > 25 && x.hotspots.length) {
      const h = x.hotspots[0]!;
      // El viento "viene de" wind.dir: sopla hacia la estancia si el foco está en esa dirección.
      const toHotspot = bearing(wind.lon, wind.lat, h.lon, h.lat);
      const diff = Math.abs(((toHotspot - wind.dir + 540) % 360) - 180);
      if (diff <= 45) {
        windTowardsFarm = true;
        severity = "warning";
      }
    }
    return upsertAlert(this.db, farm, {
      kind: "fire",
      severity,
      probability: null,
      validFrom: x.date,
      validTo: x.date,
      summary: `Foco de calor a ${x.minDistanceKm.toFixed(1)} km de la estancia${windTowardsFarm ? ", con viento hacia el campo" : ""}`,
      details: { minDistanceKm: x.minDistanceKm, windTowardsFarm, hotspots: x.hotspots.length },
    });
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

const rad = (d: number) => (d * Math.PI) / 180;
/** Rumbo inicial de 1 a 2 en grados desde el norte. */
export function bearing(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
