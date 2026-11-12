/**
 * Acceso de sistema (sin usuario): /ingest firmado por HMAC y crons. Única excepción a scopedDb.
 * Cada escritura deriva organization_id de la fila padre (lote o estancia), nunca del request.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { addDays, DEFAULT_ALERT_SETTINGS, localDate, newId, type AlertSettings } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { upsertAlert } from "../jobs/alerts";
import { dayOfYear, ndviAt } from "./queries";
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
        /** Informe de riesgo calculado en los últimos 90 días (C-10); pasado ese tiempo se recalcula. */
        hasRisk: sql<boolean>`EXISTS (SELECT 1 FROM farm_risk r WHERE r.farm_id = farms.id AND r.computed_at > ${Date.now() - 90 * 86_400_000})`,
        /** R-02: hay alguien del equipo con email a quien mandarle el parte semanal. */
        hasReportRecipient: sql<boolean>`EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = farms.organization_id AND m.role IN ('owner', 'admin') AND m.deleted_at IS NULL AND u.email IS NOT NULL)`,
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
      lowConfidence?: boolean;
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
              lowConfidence: sql`excluded.low_confidence`,
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
    layer: (typeof s.LAYERS)[number];
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

  /** R-08: estancias de OTRAS organizaciones dentro de la caja, con su centro. Solo para calcular medianas. */
  benchmarkCandidates(orgId: string, box: { minLon: number; maxLon: number; minLat: number; maxLat: number }) {
    return this.db
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
   * R-08: vigor medio (NDVI de los lotes desde `since`) y lluvia acumulada (CHIRPS desde `sinceDate`) por estancia.
   * 2 consultas por tanda de ≤ 90 estancias.
   */
  async benchmarkMetrics(farmIds: string[], since: number, sinceDate: string) {
    const out = new Map<string, { ndvi: number | null; rainMm: number | null }>();
    for (const ids of chunkForParams(farmIds, 1)) {
      const list = sql.join(ids.map((i) => sql`${i}`), sql`, `);
      const ndvi = await this.db.all<{ farm_id: string; v: number }>(
        sql`SELECT p.farm_id AS farm_id, AVG(st.mean) AS v FROM plot_index_stats st JOIN plots p ON p.id = st.plot_id
            WHERE p.farm_id IN (${list}) AND st.idx = 'ndvi' AND st.acquired_at >= ${since}
              AND st.deleted_at IS NULL AND p.deleted_at IS NULL GROUP BY p.farm_id`,
      );
      // chirps y chirps_prelim pueden repetir el día: se cuenta una vez por día
      const rain = await this.db.all<{ farm_id: string; v: number }>(
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

  async saveBenchmark(row: typeof s.zoneBenchmarks.$inferInsert) {
    await this.db
      .insert(s.zoneBenchmarks)
      .values(row)
      .onConflictDoUpdate({ target: s.zoneBenchmarks.farmId, set: row });
  }

  async clearBenchmark(farmId: string) {
    await this.db.delete(s.zoneBenchmarks).where(eq(s.zoneBenchmarks.farmId, farmId));
  }

  /** M-17: GeoTIFF de una estancia esperando su conversión a PNG georreferenciado. */
  pendingCustomLayers(farmId: string) {
    return this.db
      .select({ id: s.customLayers.id, originalPath: s.customLayers.originalPath, mime: s.customLayers.mime })
      .from(s.customLayers)
      .where(
        and(
          eq(s.customLayers.farmId, farmId),
          eq(s.customLayers.status, "processing"),
          isNull(s.customLayers.deletedAt),
        ),
      );
  }

  /** M-17: resultado de la conversión. Devuelve false si la capa no existe, ya no está pendiente o la ruta no es suya. */
  async finishCustomLayer(
    id: string,
    r:
      | { status: "failed" }
      | { status: "ready"; imagePath: string; imageMime: string; bytes: number; corners: [number, number][] },
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ org: s.customLayers.organizationId })
      .from(s.customLayers)
      .where(and(eq(s.customLayers.id, id), eq(s.customLayers.status, "processing"), isNull(s.customLayers.deletedAt)))
      .limit(1);
    if (!row) return false;
    if (r.status === "ready" && !r.imagePath.startsWith(`layers/${row.org}/${id}/`)) return false;
    const ts = Date.now();
    await runBatch(this.db, [
      bumpVersion(this.db),
      this.db
        .update(s.customLayers)
        .set(
          r.status === "failed"
            ? { status: "failed", updatedAt: ts, version: currentVersion }
            : {
                status: "ready",
                imagePath: r.imagePath,
                imageMime: r.imageMime,
                bytes: r.bytes,
                corners: JSON.stringify(r.corners),
                updatedAt: ts,
                version: currentVersion,
              },
        )
        .where(eq(s.customLayers.id, id)),
    ]);
    return true;
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

  /** S-03: el job de historia avisa que terminó (done) o falló. */
  async setHistoryStatus(farmId: string, status: "done" | "failed"): Promise<boolean> {
    const res = await this.db
      .update(s.farmHistory)
      .set({ status, updatedAt: Date.now() })
      .where(eq(s.farmHistory.farmId, farmId))
      .returning({ id: s.farmHistory.farmId });
    return res.length > 0;
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

  /**
   * S-08: reemplaza las áreas problema de un lote por las de la escena `acquiredAt` (lista vacía = las limpia).
   * Si ya hay áreas de una escena más nueva, no pisa nada. La organización sale del lote, no del request.
   */
  async replaceProblemAreas(
    plotId: string,
    acquiredAt: number,
    areas: Omit<typeof s.problemAreas.$inferInsert, "id" | "organizationId" | "farmId" | "plotId" | "acquiredAt" | "createdAt">[],
  ): Promise<number | null> {
    const [plot] = await this.db
      .select({ org: s.plots.organizationId, farmId: s.plots.farmId })
      .from(s.plots)
      .where(and(eq(s.plots.id, plotId), isNull(s.plots.deletedAt)))
      .limit(1);
    if (!plot) return null;
    const [newer] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(s.problemAreas)
      .where(and(eq(s.problemAreas.plotId, plotId), gte(s.problemAreas.acquiredAt, acquiredAt + 1)));
    if (newer && newer.n > 0) return 0;
    const ts = Date.now();
    await runBatch(this.db, [
      this.db.delete(s.problemAreas).where(eq(s.problemAreas.plotId, plotId)),
      ...areas.map((a) =>
        this.db.insert(s.problemAreas).values({
          ...a,
          id: newId(),
          organizationId: plot.org,
          farmId: plot.farmId,
          plotId,
          acquiredAt,
          createdAt: ts,
        }),
      ),
    ]);
    return areas.length;
  }

  /**
   * R-02: datos del parte semanal de una estancia para el PDF que arma workers-py. Son pocas consultas
   * agregadas; el armado del PDF (lo pesado) no pasa por el Worker. `from` y `to` son fechas locales (UTC-3).
   */
  async weeklySummary(farmId: string, from: string, to: string) {
    const [farm] = await this.db
      .select({
        name: s.farms.name,
        areaHa: s.farms.areaHa,
        department: s.farms.department,
        district: s.farms.district,
      })
      .from(s.farms)
      .where(and(eq(s.farms.id, farmId), isNull(s.farms.deletedAt)))
      .limit(1);
    if (!farm) return null;
    const fromMs = Date.parse(`${from}T00:00:00-03:00`);
    const toMs = Date.parse(`${to}T23:59:59-03:00`);
    const inWeek = and(
      eq(s.records.farmId, farmId),
      isNull(s.records.deletedAt),
      gte(s.records.capturedAt, fromMs),
      lt(s.records.capturedAt, toMs + 1),
    );
    const doys = [...new Set(Array.from({ length: 7 }, (_, i) => dayOfYear(addDays(from, i))))];
    const [byKind, [authors], [sat], normal, gauge, alerts, plots, problems] = await Promise.all([
      this.db.select({ kind: s.records.kind, n: sql<number>`count(*)` }).from(s.records).where(inWeek).groupBy(s.records.kind),
      this.db.select({ n: sql<number>`count(DISTINCT ${s.records.authorId})` }).from(s.records).where(inWeek),
      this.db
        .select({ mm: sql<number | null>`sum(${s.climateDaily.precipMm})`, n: sql<number>`count(*)` })
        .from(s.climateDaily)
        .where(
          and(
            eq(s.climateDaily.farmId, farmId),
            eq(s.climateDaily.plotId, ""),
            inArray(s.climateDaily.source, ["chirps", "chirps_prelim"]),
            gte(s.climateDaily.date, from),
            lt(s.climateDaily.date, addDays(to, 1)),
          ),
        ),
      this.db
        .select({ mean: s.climatology.mean })
        .from(s.climatology)
        .where(
          and(eq(s.climatology.farmId, farmId), eq(s.climatology.plotId, ""), eq(s.climatology.variable, "precip"), inArray(s.climatology.dayOfYear, doys)),
        ),
      this.db
        .select({ data: s.records.data })
        .from(s.records)
        .where(and(inWeek, eq(s.records.kind, "rain"))),
      this.db
        .select({ kind: s.alerts.kind, severity: s.alerts.severity, summary: s.alerts.summary })
        .from(s.alerts)
        .where(and(eq(s.alerts.farmId, farmId), gte(s.alerts.updatedAt, fromMs)))
        .limit(20),
      this.db
        .select({
          id: s.plots.id,
          name: s.plots.name,
          crop: s.plots.crop,
          kind: s.plots.kind,
          areaHa: s.plots.areaHa,
          ndvi: ndviAt("mean", 0),
          ndviPrev: ndviAt("mean", 1),
        })
        .from(s.plots)
        .where(and(eq(s.plots.farmId, farmId), isNull(s.plots.deletedAt)))
        .orderBy(s.plots.name)
        .limit(300),
      this.db
        .select({ plotName: s.plots.name, areaHa: s.problemAreas.areaHa })
        .from(s.problemAreas)
        .innerJoin(s.plots, eq(s.plots.id, s.problemAreas.plotId))
        .where(eq(s.problemAreas.farmId, farmId))
        .limit(100),
    ]);
    const normalMm = normal.reduce((a, r) => a + (r.mean ?? 0), 0);
    const gaugeMm = gauge.reduce((a, r) => a + ((JSON.parse(r.data) as { mm?: number }).mm ?? 0), 0);
    return {
      farm,
      period: { from, to },
      records: { total: byKind.reduce((a, k) => a + k.n, 0), authors: authors?.n ?? 0, byKind },
      rain: {
        satMm: sat && sat.n > 0 ? (sat.mm ?? 0) : null,
        normalMm: normal.length ? normalMm : null,
        gaugeMm: gauge.length ? gaugeMm : null,
      },
      alerts,
      plots,
      problemAreas: problems,
    };
  }

  /** R-02: registra el PDF semanal ya subido a R2 (reemplaza el del mismo período). */
  async saveWeeklyReport(farmId: string, periodStart: string, periodEnd: string, storagePath: string, now: number) {
    const [farm] = await this.db
      .select({ org: s.farms.organizationId })
      .from(s.farms)
      .where(and(eq(s.farms.id, farmId), isNull(s.farms.deletedAt)))
      .limit(1);
    if (!farm) return false;
    await runBatch(this.db, [
      this.db
        .delete(s.reports)
        .where(and(eq(s.reports.farmId, farmId), eq(s.reports.kind, "weekly"), eq(s.reports.periodStart, periodStart))),
      this.db.insert(s.reports).values({
        id: newId(),
        organizationId: farm.org,
        farmId,
        kind: "weekly",
        periodStart,
        periodEnd,
        storagePath,
        status: "done",
        createdAt: now,
      }),
    ]);
    return true;
  }

  /** R-02: PDF semanal generado en los últimos `maxAgeMs` (para adjuntarlo al email del lunes). */
  async latestWeeklyReport(farmId: string, now: number, maxAgeMs: number) {
    const [r] = await this.db
      .select({ storagePath: s.reports.storagePath, periodStart: s.reports.periodStart, periodEnd: s.reports.periodEnd })
      .from(s.reports)
      .where(
        and(
          eq(s.reports.farmId, farmId),
          eq(s.reports.kind, "weekly"),
          eq(s.reports.status, "done"),
          gte(s.reports.createdAt, now - maxAgeMs),
        ),
      )
      .orderBy(desc(s.reports.createdAt))
      .limit(1);
    return r?.storagePath ? { ...r, storagePath: r.storagePath } : null;
  }

  /** C-10: guarda (reemplaza) el informe de riesgo de la estancia. */
  /** A-32: reemplaza las zonas de manejo de un lote. La organización y la estancia salen del lote, no del request. */
  async replaceManagementZones(
    plotId: string,
    seasons: number[],
    zones: { zone: number; areaHa: number; pct: number; meanNdvi: number; geometry: string }[],
  ): Promise<number | null> {
    const [plot] = await this.db
      .select({ org: s.plots.organizationId, farmId: s.plots.farmId })
      .from(s.plots)
      .where(and(eq(s.plots.id, plotId), isNull(s.plots.deletedAt)))
      .limit(1);
    if (!plot) return null;
    const ts = Date.now();
    await runBatch(this.db, [
      this.db.delete(s.managementZones).where(eq(s.managementZones.plotId, plotId)),
      ...chunkForParams(zones, 11).map((chunk) =>
        this.db.insert(s.managementZones).values(
          chunk.map((z) => ({
            ...z,
            id: newId(),
            organizationId: plot.org,
            farmId: plot.farmId,
            plotId,
            seasons: JSON.stringify(seasons),
            computedAt: ts,
          })),
        ),
      ),
    ]);
    return zones.length;
  }

  /** C-07: guarda (reemplaza) el SPI de la estancia. */
  async upsertFarmSpi(farmId: string, report: string, now: number): Promise<boolean> {
    const [f] = await this.db
      .select({ id: s.farms.id })
      .from(s.farms)
      .where(and(eq(s.farms.id, farmId), isNull(s.farms.deletedAt)))
      .limit(1);
    if (!f) return false;
    await this.db
      .insert(s.farmSpi)
      .values({ farmId, computedAt: now, report })
      .onConflictDoUpdate({ target: s.farmSpi.farmId, set: { computedAt: now, report } });
    return true;
  }

  /** C-07: lluvia diaria de la estancia desde una fecha (CHIRPS final, o preliminar si la final todavía no salió). */
  async farmPrecip(farmId: string, from: string) {
    const rows = await this.db
      .select({ date: s.climateDaily.date, source: s.climateDaily.source, mm: s.climateDaily.precipMm })
      .from(s.climateDaily)
      .where(
        and(
          eq(s.climateDaily.farmId, farmId),
          eq(s.climateDaily.plotId, ""),
          inArray(s.climateDaily.source, ["chirps", "chirps_prelim"]),
          gte(s.climateDaily.date, from),
        ),
      )
      .orderBy(asc(s.climateDaily.date))
      .limit(400);
    const byDate = new Map<string, { mm: number; final: boolean }>();
    for (const r of rows) {
      if (r.mm === null) continue;
      const cur = byDate.get(r.date);
      if (!cur || (r.source === "chirps" && !cur.final)) byDate.set(r.date, { mm: r.mm, final: r.source === "chirps" });
    }
    return [...byDate.entries()].map(([date, v]) => ({ date, mm: v.mm }));
  }

  async upsertFarmRisk(farmId: string, report: string, now: number): Promise<boolean> {
    const [f] = await this.db
      .select({ id: s.farms.id })
      .from(s.farms)
      .where(and(eq(s.farms.id, farmId), isNull(s.farms.deletedAt)))
      .limit(1);
    if (!f) return false;
    await this.db
      .insert(s.farmRisk)
      .values({ farmId, computedAt: now, report })
      .onConflictDoUpdate({ target: s.farmRisk.farmId, set: { computedAt: now, report } });
    return true;
  }

  /** S-30: guarda (reemplaza) el indicador EUDR de un lote. La organización sale del lote, no del request. */
  async upsertEudrResult(
    plotId: string,
    r: Omit<typeof s.eudrResults.$inferInsert, "id" | "organizationId" | "farmId" | "plotId" | "computedAt">,
  ): Promise<boolean> {
    const [plot] = await this.db
      .select({ org: s.plots.organizationId, farmId: s.plots.farmId })
      .from(s.plots)
      .where(and(eq(s.plots.id, plotId), isNull(s.plots.deletedAt)))
      .limit(1);
    if (!plot) return false;
    const row = { ...r, organizationId: plot.org, farmId: plot.farmId, plotId, computedAt: Date.now() };
    const { plotId: _p, ...set } = row;
    await this.db
      .insert(s.eudrResults)
      .values({ ...row, id: newId() })
      .onConflictDoUpdate({ target: s.eudrResults.plotId, set });
    return true;
  }

  /** S-20: focos de calor guardados cerca de la estancia (bbox + ~2 km) desde `since`. */
  async farmHotspots(farmId: string, since: number) {
    const [f] = await this.db
      .select({ minLon: s.farms.minLon, minLat: s.farms.minLat, maxLon: s.farms.maxLon, maxLat: s.farms.maxLat })
      .from(s.farms)
      .where(and(eq(s.farms.id, farmId), isNull(s.farms.deletedAt)))
      .limit(1);
    if (!f) return null;
    const pad = 0.02;
    return this.db
      .select({ lon: s.fireHotspots.lon, lat: s.fireHotspots.lat, acquiredAt: s.fireHotspots.acquiredAt, confidence: s.fireHotspots.confidence })
      .from(s.fireHotspots)
      .where(
        and(
          gte(s.fireHotspots.acquiredAt, since),
          gte(s.fireHotspots.lon, f.minLon - pad),
          lte(s.fireHotspots.lon, f.maxLon + pad),
          gte(s.fireHotspots.lat, f.minLat - pad),
          lte(s.fireHotspots.lat, f.maxLat + pad),
        ),
      )
      .orderBy(s.fireHotspots.acquiredAt)
      .limit(500);
  }

  /** S-20 y S-31: guarda (reemplaza) el análisis de un lote. La organización sale del lote, no del request. */
  async upsertAnalysis(
    plotId: string,
    r: Pick<typeof s.plotAnalyses.$inferInsert, "kind" | "refKey" | "fromAt" | "toAt" | "plotAreaHa" | "validPct" | "metrics" | "changes">,
  ): Promise<boolean> {
    const [plot] = await this.db
      .select({ org: s.plots.organizationId, farmId: s.plots.farmId })
      .from(s.plots)
      .where(and(eq(s.plots.id, plotId), isNull(s.plots.deletedAt)))
      .limit(1);
    if (!plot) return false;
    const row = { ...r, organizationId: plot.org, farmId: plot.farmId, plotId, computedAt: Date.now() };
    const { plotId: _p, kind: _k, refKey: _r, ...set } = row;
    await this.db
      .insert(s.plotAnalyses)
      .values({ ...row, id: newId() })
      .onConflictDoUpdate({ target: [s.plotAnalyses.plotId, s.plotAnalyses.kind, s.plotAnalyses.refKey], set });
    return true;
  }

  /** S-31: el job termina (o falla); solo cambia el estado de un pedido existente. */
  async setAnalysisStatus(farmId: string, kind: s.AnalysisKind, status: "done" | "failed"): Promise<boolean> {
    const res = await this.db
      .update(s.analysisJobs)
      .set({ status, updatedAt: Date.now() })
      .where(and(eq(s.analysisJobs.farmId, farmId), eq(s.analysisJobs.kind, kind)))
      .returning({ id: s.analysisJobs.farmId });
    return res.length > 0;
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
