/**
 * Acceso de sistema (sin usuario): /ingest firmado por HMAC y crons. Única excepción a scopedDb.
 * Cada escritura deriva organization_id de la fila padre (lote o estancia), nunca del request.
 */
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { addDays, DEFAULT_ALERT_SETTINGS, localDate, newId, type AlertSettings } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { upsertAlert } from "../jobs/alerts";
import { dayOfYear } from "./queries";
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

  /**
   * Resumen público de una estancia para un enlace de solo lectura (K-04). Devuelve el motivo si el enlace no sirve.
   * No incluye registros, personas ni geometrías: solo lotes, superficie, vigor, lluvia y avisos.
   */
  async sharedSummary(tokenHash: string, now: number) {
    const [link] = await this.db
      .select({
        farmId: s.shareLinks.farmId,
        expiresAt: s.shareLinks.expiresAt,
        revokedAt: s.shareLinks.revokedAt,
        name: s.farms.name,
        department: s.farms.department,
        areaHa: s.farms.areaHa,
      })
      .from(s.shareLinks)
      .innerJoin(s.farms, and(eq(s.farms.id, s.shareLinks.farmId), isNull(s.farms.deletedAt)))
      .where(eq(s.shareLinks.tokenHash, tokenHash))
      .limit(1);
    if (!link) return { error: "not_found" as const };
    if (link.revokedAt !== null) return { error: "revoked" as const };
    if (link.expiresAt <= now) return { error: "expired" as const };
    const farmId = link.farmId;
    const today = localDate(now);
    const from30 = addDays(today, -30);
    const [plots, rain, alerts] = await Promise.all([
      this.db
        .select({
          name: s.plots.name,
          kind: s.plots.kind,
          crop: s.plots.crop,
          areaHa: s.plots.areaHa,
          ndvi: sql<number | null>`(SELECT mean FROM plot_index_stats i WHERE i.plot_id = plots.id AND i.idx = 'ndvi' ORDER BY i.acquired_at DESC LIMIT 1)`,
          ndviAt: sql<number | null>`(SELECT acquired_at FROM plot_index_stats i WHERE i.plot_id = plots.id AND i.idx = 'ndvi' ORDER BY i.acquired_at DESC LIMIT 1)`,
        })
        .from(s.plots)
        .where(and(eq(s.plots.farmId, farmId), isNull(s.plots.deletedAt)))
        .orderBy(s.plots.name)
        .limit(500),
      this.db
        .select({ mm: sql<number | null>`sum(${s.climateDaily.precipMm})`, n: sql<number>`count(*)` })
        .from(s.climateDaily)
        .where(
          and(
            eq(s.climateDaily.farmId, farmId),
            eq(s.climateDaily.plotId, ""),
            inArray(s.climateDaily.source, ["chirps", "chirps_prelim"]),
            gte(s.climateDaily.date, from30),
          ),
        ),
      this.db
        .select({
          kind: s.alerts.kind,
          severity: s.alerts.severity,
          summary: s.alerts.summary,
          validFrom: s.alerts.validFrom,
          validTo: s.alerts.validTo,
        })
        .from(s.alerts)
        .where(
          and(
            eq(s.alerts.farmId, farmId),
            isNull(s.alerts.resolvedAt),
            or(isNull(s.alerts.validTo), sql`${s.alerts.validTo} >= ${now}`),
          ),
        )
        .orderBy(desc(s.alerts.validFrom))
        .limit(50),
    ]);
    const doys = Array.from({ length: 30 }, (_, i) => dayOfYear(addDays(today, -i)));
    const clim = await this.db
      .select({ mean: s.climatology.mean })
      .from(s.climatology)
      .where(
        and(eq(s.climatology.farmId, farmId), eq(s.climatology.plotId, ""), eq(s.climatology.variable, "precip"), inArray(s.climatology.dayOfYear, doys)),
      );
    const normal = clim.length ? clim.reduce((a, c) => a + (c.mean ?? 0), 0) : null;
    return {
      farm: { name: link.name, department: link.department, areaHa: link.areaHa, plotCount: plots.length },
      plots,
      rain30: { mm: rain[0] && rain[0].n >= 25 ? (rain[0].mm ?? 0) : null, normalMm: normal },
      alerts,
      generatedAt: now,
      expiresAt: link.expiresAt,
      today,
    };
  }

  /** Umbrales de avisos de la estancia (C-04); por defecto si no hay fila. */
  async alertSettings(farmId: string): Promise<AlertSettings> {
    const [row] = await this.db
      .select()
      .from(s.farmAlertSettings)
      .where(eq(s.farmAlertSettings.farmId, farmId))
      .limit(1);
    return row
      ? {
          frostTminC: row.frostTminC,
          excessRainMm24h: row.excessRainMm24h,
          droughtDeficitPct: row.droughtDeficitPct,
        }
      : { ...DEFAULT_ALERT_SETTINGS };
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
      // El mapa base marca el fin del primer procesamiento (S-02)
      ...(x.layer === "true_color" ? [this.imageryUpsert(x.farmId, "ready", ts)] : []),
    ]);
    return { id };
  }

  private imageryUpsert(farmId: string, status: (typeof s.IMAGERY_STATUSES)[number], ts: number) {
    return this.db
      .insert(s.farmImagery)
      .values({ farmId, status, requestedAt: ts, updatedAt: ts })
      .onConflictDoUpdate({ target: s.farmImagery.farmId, set: { status, updatedAt: ts } });
  }

  /** Estado del procesamiento satelital inicial. Devuelve false si la estancia no existe. */
  async setImageryStatus(farmId: string, status: (typeof s.IMAGERY_STATUSES)[number]): Promise<boolean> {
    const [farm] = await this.db.select({ id: s.farms.id }).from(s.farms).where(eq(s.farms.id, farmId)).limit(1);
    if (!farm) return false;
    await this.imageryUpsert(farmId, status, Date.now());
    return true;
  }

  climateLatest() {
    return this.db
      .select({
        farmId: s.climateDaily.farmId,
        source: s.climateDaily.source,
        latest: sql<string>`max(${s.climateDaily.date})`,
      })
      .from(s.climateDaily)
      .where(eq(s.climateDaily.plotId, ""))
      .groupBy(s.climateDaily.farmId, s.climateDaily.source);
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
      summary: `Foco de calor a ${x.minDistanceKm.toFixed(1).replace(".", ",")} km de la estancia${windTowardsFarm ? ", con viento hacia el campo" : ""}`,
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
