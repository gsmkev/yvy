/**
 * Consultas de la web y operaciones de edición. Todas reciben ScopedDb y filtran por organización
 * (y por lotes asignados cuando corresponde).
 */
import { and, asc, desc, eq, getTableColumns, gte, inArray, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { DEFAULT_ALERT_SETTINGS, LIMITS, type AlertSettings, type RecordKind } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { newId } from "@yvy/shared";
import { randomToken, sha256Hex } from "../lib/crypto";
import { bumpVersion, chunkForParams, currentVersion, runBatch, type Stmt } from "./client";
import { can, ForbiddenError, NotFoundError, type ScopedDb } from "./scoped";

// ---------- Inicio multi estancia (RF-90) ----------

type ImageryStatus = (typeof s.IMAGERY_STATUSES)[number];
/** Estado del primer procesamiento; las estancias anteriores a S-02 con mapa base cuentan como listas. */
const IMAGERY_SQL = sql.raw(
  `COALESCE((SELECT status FROM farm_imagery fi WHERE fi.farm_id = farms.id), CASE WHEN EXISTS (SELECT 1 FROM farm_layers l WHERE l.farm_id = farms.id AND l.layer = 'true_color' AND l.deleted_at IS NULL) THEN 'ready' END)`,
);

export async function farmSummaries(sdb: ScopedDb) {
  const org = sdb.auth.orgId;
  const now = sdb.now();
  return sdb.db
    .select({
      id: s.farms.id,
      name: s.farms.name,
      department: s.farms.department,
      timezone: s.farms.timezone,
      areaHa: s.farms.areaHa,
      geometry: s.farms.geometry,
      centroidLon: s.farms.centroidLon,
      centroidLat: s.farms.centroidLat,
      minLon: s.farms.minLon,
      minLat: s.farms.minLat,
      maxLon: s.farms.maxLon,
      maxLat: s.farms.maxLat,
      plots: sql<number>`(SELECT count(*) FROM plots p WHERE p.farm_id = farms.id AND p.deleted_at IS NULL)`,
      workers: sql<number>`(SELECT count(DISTINCT pa.user_id) FROM plot_assignments pa JOIN plots p ON p.id = pa.plot_id WHERE p.farm_id = farms.id AND pa.deleted_at IS NULL)`,
      activeAlerts: sql<number>`(SELECT count(*) FROM alerts a WHERE a.farm_id = farms.id AND a.resolved_at IS NULL AND (a.valid_to IS NULL OR a.valid_to >= ${now}))`,
      lastRecordAt: sql<
        number | null
      >`(SELECT max(captured_at) FROM records r WHERE r.farm_id = farms.id AND r.deleted_at IS NULL)`,
      basemapPath: sql<
        string | null
      >`(SELECT pmtiles_path FROM farm_layers l WHERE l.farm_id = farms.id AND l.layer = 'true_color' AND l.deleted_at IS NULL ORDER BY acquired_at DESC LIMIT 1)`,
      imageryStatus: sql<ImageryStatus | null>`${IMAGERY_SQL}`,
      records7d: sql<number>`(SELECT count(*) FROM records r WHERE r.farm_id = farms.id AND r.deleted_at IS NULL AND r.captured_at >= ${now - 7 * 86_400_000})`,
    })
    .from(s.farms)
    .where(and(eq(s.farms.organizationId, org), isNull(s.farms.deletedAt), sdb.workerFilter("farms")))
    .orderBy(asc(s.farms.name));
}

/** Subconsulta: columna de la pasada NDVI número `offset` (0 = la última) del lote de la fila. */
export const ndviAt = (col: "mean" | "acquired_at", offset: number) =>
  sql<
    number | null
  >`(SELECT ${sql.raw(col)} FROM plot_index_stats x WHERE x.plot_id = plots.id AND x.idx = 'ndvi' AND x.deleted_at IS NULL ORDER BY x.acquired_at DESC LIMIT 1 OFFSET ${sql.raw(String(offset))})`;

export async function farmDetail(sdb: ScopedDb, farmId: string) {
  const org = sdb.auth.orgId;
  const [farm] = await sdb.db
    .select()
    .from(s.farms)
    .where(
      and(
        eq(s.farms.id, farmId),
        eq(s.farms.organizationId, org),
        isNull(s.farms.deletedAt),
        sdb.workerFilter("farms"),
      ),
    )
    .limit(1);
  if (!farm) throw new NotFoundError("Estancia inexistente");
  const [[imagery], plots, pois, layers, assignments] = await Promise.all([
    sdb.db
      .select({
        status: sql<ImageryStatus | null>`${IMAGERY_SQL}`,
        requestedAt: sql<number | null>`(SELECT requested_at FROM farm_imagery fi WHERE fi.farm_id = farms.id)`,
      })
      .from(s.farms)
      .where(eq(s.farms.id, farmId))
      .limit(1),
    sdb.db
      .select({
        ...getTableColumns(s.plots),
        // Vigor: últimas dos pasadas de NDVI y última visita, en una sola consulta (subconsultas correlacionadas).
        ndviMean: ndviAt("mean", 0),
        ndviAt: ndviAt("acquired_at", 0),
        ndviPrevMean: ndviAt("mean", 1),
        ndviPrevAt: ndviAt("acquired_at", 1),
        lastRecordAt: sql<
          number | null
        >`(SELECT max(r.captured_at) FROM records r WHERE r.plot_id = plots.id AND r.deleted_at IS NULL)`,
      })
      .from(s.plots)
      .where(and(eq(s.plots.farmId, farmId), isNull(s.plots.deletedAt), sdb.workerFilter("plots")))
      .orderBy(asc(s.plots.name)),
    sdb.db
      .select({
        ...getTableColumns(s.pointsOfInterest),
        // G-30: último nivel de agua registrado en la aguada o tajamar.
        lastWaterLevel: sql<
          string | null
        >`(SELECT json_extract(r.data, '$.level') FROM records r WHERE r.poi_id = points_of_interest.id AND r.kind = 'water' AND r.deleted_at IS NULL ORDER BY r.captured_at DESC LIMIT 1)`,
        lastWaterAt: sql<
          number | null
        >`(SELECT max(r.captured_at) FROM records r WHERE r.poi_id = points_of_interest.id AND r.kind = 'water' AND r.deleted_at IS NULL)`,
      })
      .from(s.pointsOfInterest)
      .where(and(eq(s.pointsOfInterest.farmId, farmId), isNull(s.pointsOfInterest.deletedAt))),
    sdb.db
      .select()
      .from(s.farmLayers)
      .where(and(eq(s.farmLayers.farmId, farmId), isNull(s.farmLayers.deletedAt)))
      .orderBy(desc(s.farmLayers.acquiredAt))
      .limit(20),
    sdb.isWorker
      ? Promise.resolve([])
      : sdb.db
          .select({ plotId: s.plotAssignments.plotId, userId: s.plotAssignments.userId })
          .from(s.plotAssignments)
          .innerJoin(s.plots, eq(s.plots.id, s.plotAssignments.plotId))
          .where(and(eq(s.plots.farmId, farmId), isNull(s.plotAssignments.deletedAt))),
  ]);
  return {
    farm,
    plots,
    pois,
    layers,
    assignments,
    imageryStatus: imagery?.status ?? null,
    imageryRequestedAt: imagery?.requestedAt ?? null,
  };
}

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
      attachments: sql<string>`(SELECT json_group_array(json_object('id', a.id, 'uploadStatus', a.upload_status)) FROM attachments a WHERE a.record_id = ${s.records.id} AND a.deleted_at IS NULL)`,
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
    attachments: JSON.parse(r.attachments) as { id: string; uploadStatus: string }[],
  }));
  const last = page[page.length - 1];
  return { rows: page, nextCursor: rows.length > limit && last ? { capturedAt: last.capturedAt, id: last.id } : null };
}

// ---------- Tareas (RF-22) ----------

export async function listTasks(
  sdb: ScopedDb,
  f: { farmId?: string; assigneeId?: string; status?: string; from?: string; to?: string },
) {
  return sdb.db
    .select({ task: s.tasks, assigneeName: s.users.fullName, plotName: s.plots.name })
    .from(s.tasks)
    .leftJoin(s.users, eq(s.users.id, s.tasks.assigneeId))
    .leftJoin(s.plots, eq(s.plots.id, s.tasks.plotId))
    .where(
      and(
        eq(s.tasks.organizationId, sdb.auth.orgId),
        isNull(s.tasks.deletedAt),
        sdb.workerFilter("tasks"),
        f.farmId ? eq(s.tasks.farmId, f.farmId) : undefined,
        f.assigneeId ? eq(s.tasks.assigneeId, f.assigneeId) : undefined,
        f.status ? eq(s.tasks.status, f.status as "open") : undefined,
        f.from ? gte(s.tasks.dueDate, f.from) : undefined,
        f.to ? lte(s.tasks.dueDate, f.to) : undefined,
      ),
    )
    .orderBy(asc(s.tasks.dueDate))
    .limit(500);
}

// ---------- Satélite (RF-53) ----------

export async function plotNdvi(sdb: ScopedDb, plotId: string) {
  sdb.require(can.viewAll);
  const [plot] = await sdb.db
    .select({ id: s.plots.id, farmId: s.plots.farmId, crop: s.plots.crop, kind: s.plots.kind })
    .from(s.plots)
    .where(and(eq(s.plots.id, plotId), eq(s.plots.organizationId, sdb.auth.orgId)))
    .limit(1);
  if (!plot) throw new NotFoundError("Lote inexistente");
  const since = sdb.now() - LIMITS.sync.indexStatsHistoryMs;
  const [series, farmAvg] = await Promise.all([
    sdb.db
      .select({
        acquiredAt: s.plotIndexStats.acquiredAt,
        mean: s.plotIndexStats.mean,
        p10: s.plotIndexStats.p10,
        p90: s.plotIndexStats.p90,
        validPct: s.plotIndexStats.validPct,
      })
      .from(s.plotIndexStats)
      .where(and(eq(s.plotIndexStats.plotId, plotId), gte(s.plotIndexStats.acquiredAt, since)))
      .orderBy(asc(s.plotIndexStats.acquiredAt)),
    // Promedio del campo para el mismo cultivo (o tipo de lote) en cada escena.
    sdb.db
      .select({
        acquiredAt: sql<number>`min(${s.plotIndexStats.acquiredAt})`,
        mean: sql<number>`avg(${s.plotIndexStats.mean})`,
      })
      .from(s.plotIndexStats)
      .innerJoin(s.plots, eq(s.plots.id, s.plotIndexStats.plotId))
      .where(
        and(
          eq(s.plots.farmId, plot.farmId),
          isNull(s.plots.deletedAt),
          plot.crop ? eq(s.plots.crop, plot.crop) : eq(s.plots.kind, plot.kind),
          gte(s.plotIndexStats.acquiredAt, since),
        ),
      )
      .groupBy(s.plotIndexStats.sceneId)
      .orderBy(asc(sql`min(${s.plotIndexStats.acquiredAt})`)),
  ]);
  const last = series[series.length - 1];
  const lastAvg = last && farmAvg.find((a) => a.acquiredAt === last.acquiredAt);
  return {
    series,
    farmAvg,
    current: last ?? null,
    deltaVsFarmPct: last && lastAvg && lastAvg.mean ? ((last.mean - lastAvg.mean) / lastAvg.mean) * 100 : null,
  };
}

// ---------- Clima (RF-60..63) ----------

export async function farmClimate(sdb: ScopedDb, farmId: string, days = 90) {
  await sdb.requireFarm(farmId);
  const since = new Date(sdb.now() - days * 86_400_000).toISOString().slice(0, 10);
  const [daily, latestRun, gauge] = await Promise.all([
    sdb.db
      .select()
      .from(s.climateDaily)
      .where(and(eq(s.climateDaily.farmId, farmId), eq(s.climateDaily.plotId, ""), gte(s.climateDaily.date, since)))
      .orderBy(asc(s.climateDaily.date)),
    sdb.db
      .select({ runAt: sql<number>`max(${s.forecasts.runAt})` })
      .from(s.forecasts)
      .where(eq(s.forecasts.farmId, farmId)),
    // RF-63: lluvia de pluviómetro cargada por los empleados.
    sdb.db
      .select({ capturedAt: s.records.capturedAt, data: s.records.data, poiId: s.records.poiId })
      .from(s.records)
      .where(
        and(
          eq(s.records.organizationId, sdb.auth.orgId),
          eq(s.records.farmId, farmId),
          eq(s.records.kind, "rain"),
          isNull(s.records.deletedAt),
          gte(s.records.capturedAt, sdb.now() - days * 86_400_000),
        ),
      ),
  ]);
  const runAt = latestRun[0]?.runAt;
  const forecast = runAt
    ? await sdb.db
        .select()
        .from(s.forecasts)
        .where(and(eq(s.forecasts.farmId, farmId), eq(s.forecasts.runAt, runAt)))
        .orderBy(asc(s.forecasts.validDate))
    : [];
  const doys = [...new Set(daily.map((d) => dayOfYear(d.date)))];
  // ≤ 90 parámetros por consulta: se trae por tandas (hasta 366 días para los informes de campaña).
  const clim: (typeof s.climatology.$inferSelect)[] = [];
  for (const chunk of chunkForParams(doys.slice(0, 366), 1)) {
    clim.push(
      ...(await sdb.db
        .select()
        .from(s.climatology)
        .where(
          and(eq(s.climatology.farmId, farmId), eq(s.climatology.plotId, ""), inArray(s.climatology.dayOfYear, chunk)),
        )),
    );
  }
  return {
    daily,
    climatology: clim,
    forecast,
    forecastRunAt: runAt ?? null,
    gauge: gauge.map((g) => ({
      capturedAt: g.capturedAt,
      poiId: g.poiId,
      mm: (JSON.parse(g.data) as { mm: number }).mm,
    })),
  };
}

/** C-02: último pronóstico de la estancia, liviano, para que la app lo guarde y lo lea sin señal. */
export async function farmForecast(sdb: ScopedDb, farmId: string) {
  const [farm] = await sdb.db
    .select({ id: s.farms.id })
    .from(s.farms)
    .where(
      and(
        eq(s.farms.id, farmId),
        eq(s.farms.organizationId, sdb.auth.orgId),
        isNull(s.farms.deletedAt),
        sdb.workerFilter("farms"),
      ),
    )
    .limit(1);
  if (!farm) throw new NotFoundError("Estancia inexistente");
  const [latest] = await sdb.db
    .select({ runAt: sql<number | null>`max(${s.forecasts.runAt})` })
    .from(s.forecasts)
    .where(eq(s.forecasts.farmId, farmId));
  const runAt = latest?.runAt ?? null;
  if (!runAt) return { runAt: null, source: null, days: [] };
  const rows = await sdb.db
    .select({
      date: s.forecasts.validDate,
      tminC: s.forecasts.tminC,
      tmaxC: s.forecasts.tmaxC,
      precipMm: s.forecasts.precipMm,
      source: s.forecasts.source,
    })
    .from(s.forecasts)
    .where(and(eq(s.forecasts.farmId, farmId), eq(s.forecasts.runAt, runAt)))
    .orderBy(asc(s.forecasts.validDate))
    .limit(10);
  return {
    runAt,
    source: rows[0]?.source ?? null,
    days: rows.map(({ source: _source, ...d }) => d),
  };
}

/** S-08: áreas problema de la estancia (última escena por lote), con el nombre del lote. */
export async function farmProblemAreas(sdb: ScopedDb, farmId: string) {
  sdb.require(can.viewAll);
  await sdb.requireFarm(farmId);
  return sdb.db
    .select({
      id: s.problemAreas.id,
      plotId: s.problemAreas.plotId,
      plotName: s.plots.name,
      acquiredAt: s.problemAreas.acquiredAt,
      geometry: s.problemAreas.geometry,
      lon: s.problemAreas.lon,
      lat: s.problemAreas.lat,
      areaHa: s.problemAreas.areaHa,
      meanNdvi: s.problemAreas.meanNdvi,
      plotMedianNdvi: s.problemAreas.plotMedianNdvi,
    })
    .from(s.problemAreas)
    .innerJoin(s.plots, and(eq(s.plots.id, s.problemAreas.plotId), isNull(s.plots.deletedAt)))
    .where(and(eq(s.problemAreas.farmId, farmId), eq(s.problemAreas.organizationId, sdb.auth.orgId)))
    .orderBy(desc(s.problemAreas.areaHa))
    .limit(200);
}

/** C-10: informe de riesgo climático ya calculado (workers-py). Solo roles con vista completa. */
export async function farmRiskReport(sdb: ScopedDb, farmId: string) {
  sdb.require(can.viewAll);
  await sdb.requireFarm(farmId);
  const [row] = await sdb.db.select().from(s.farmRisk).where(eq(s.farmRisk.farmId, farmId)).limit(1);
  if (!row) return { computedAt: null, report: null };
  return { computedAt: row.computedAt, report: JSON.parse(row.report) as unknown };
}

export const dayOfYear = (date: string): number => {
  const d = Date.parse(`${date}T00:00:00Z`);
  return Math.floor((d - Date.parse(`${date.slice(0, 4)}-01-01T00:00:00Z`)) / 86_400_000) + 1;
};

// ---------- Avisos (RF-70..75) ----------

export async function listAlerts(sdb: ScopedDb, f: { farmId?: string; active?: boolean }) {
  const now = sdb.now();
  return sdb.db
    .select({
      alert: s.alerts,
      useful: sql<
        number | null
      >`(SELECT useful FROM alert_feedback WHERE alert_id = ${s.alerts.id} AND user_id = ${sdb.auth.userId})`,
    })
    .from(s.alerts)
    .where(
      and(
        eq(s.alerts.organizationId, sdb.auth.orgId),
        sdb.workerFilter("alerts"),
        f.farmId ? eq(s.alerts.farmId, f.farmId) : undefined,
        f.active
          ? and(isNull(s.alerts.resolvedAt), or(isNull(s.alerts.validTo), gte(s.alerts.validTo, now)))
          : undefined,
      ),
    )
    .orderBy(desc(s.alerts.validFrom))
    .limit(200);
}

export async function alertFeedback(sdb: ScopedDb, alertId: string, useful: boolean, comment: string | null) {
  const [a] = await sdb.db
    .select({ id: s.alerts.id })
    .from(s.alerts)
    .where(and(eq(s.alerts.id, alertId), eq(s.alerts.organizationId, sdb.auth.orgId), sdb.workerFilter("alerts")))
    .limit(1);
  if (!a) throw new NotFoundError("Aviso inexistente");
  await sdb.db
    .insert(s.alertFeedback)
    .values({ alertId, userId: sdb.auth.userId, useful, comment })
    .onConflictDoUpdate({ target: [s.alertFeedback.alertId, s.alertFeedback.userId], set: { useful, comment } });
}

/** C-04: umbrales de avisos de la estancia (valores por defecto si nunca se configuraron). */
export async function getAlertSettings(
  sdb: ScopedDb,
  farmId: string,
): Promise<AlertSettings & { isDefault: boolean }> {
  sdb.require(can.viewAll);
  await sdb.requireFarm(farmId);
  const [row] = await sdb.db
    .select()
    .from(s.farmAlertSettings)
    .where(and(eq(s.farmAlertSettings.farmId, farmId), eq(s.farmAlertSettings.organizationId, sdb.auth.orgId)))
    .limit(1);
  if (!row) return { ...DEFAULT_ALERT_SETTINGS, isDefault: true };
  return {
    frostTminC: row.frostTminC,
    excessRainMm24h: row.excessRainMm24h,
    droughtDeficitPct: row.droughtDeficitPct,
    isDefault: false,
  };
}

export async function saveAlertSettings(sdb: ScopedDb, farmId: string, v: AlertSettings) {
  sdb.require(can.alertSettings, "Solo el dueño o un administrador cambian los avisos");
  await sdb.requireFarm(farmId);
  const row = { ...v, organizationId: sdb.auth.orgId, updatedAt: sdb.now(), updatedBy: sdb.auth.userId };
  await sdb.db
    .insert(s.farmAlertSettings)
    .values({ farmId, ...row })
    .onConflictDoUpdate({ target: s.farmAlertSettings.farmId, set: row });
}

// ---------- Enlaces de solo lectura (K-04) ----------

/** Crea el enlace; devuelve el token en claro una sola vez (en la base queda su hash). */
export async function createShareLink(sdb: ScopedDb, farmId: string, days: number) {
  sdb.require(can.shareLinks, "Solo el dueño crea enlaces para compartir");
  if (!(LIMITS.share.linkDays as readonly number[]).includes(days)) throw new ForbiddenError("Duración no permitida");
  await sdb.requireFarm(farmId);
  const token = randomToken(32);
  const id = newId();
  const ts = sdb.now();
  const expiresAt = ts + days * 86_400_000;
  await sdb.db.insert(s.shareLinks).values({
    id,
    organizationId: sdb.auth.orgId,
    farmId,
    tokenHash: await sha256Hex(token),
    createdBy: sdb.auth.userId,
    createdAt: ts,
    expiresAt,
  });
  return { id, token, expiresAt };
}

export async function listShareLinks(sdb: ScopedDb, farmId: string) {
  sdb.require(can.shareLinks, "Solo el dueño ve los enlaces para compartir");
  await sdb.requireFarm(farmId);
  return sdb.db
    .select({
      id: s.shareLinks.id,
      createdAt: s.shareLinks.createdAt,
      expiresAt: s.shareLinks.expiresAt,
      revokedAt: s.shareLinks.revokedAt,
    })
    .from(s.shareLinks)
    .where(and(eq(s.shareLinks.farmId, farmId), eq(s.shareLinks.organizationId, sdb.auth.orgId)))
    .orderBy(desc(s.shareLinks.createdAt))
    .limit(50);
}

export async function revokeShareLink(sdb: ScopedDb, id: string) {
  sdb.require(can.shareLinks, "Solo el dueño revoca enlaces");
  const [row] = await sdb.db
    .select({ id: s.shareLinks.id })
    .from(s.shareLinks)
    .where(and(eq(s.shareLinks.id, id), eq(s.shareLinks.organizationId, sdb.auth.orgId)))
    .limit(1);
  if (!row) throw new NotFoundError("Enlace inexistente");
  await sdb.db
    .update(s.shareLinks)
    .set({ revokedAt: sdb.now() })
    .where(and(eq(s.shareLinks.id, id), isNull(s.shareLinks.revokedAt)));
}

// ---------- Edición y borrado lógico ----------

type SyncedTbl = SQLiteTable & {
  id: SQLiteColumn;
  organizationId: SQLiteColumn;
  deletedAt: SQLiteColumn;
};

export async function updateSynced(
  sdb: ScopedDb,
  table: SyncedTbl,
  id: string,
  patch: Record<string, unknown>,
  extra: Stmt[] = [],
) {
  const ts = sdb.now();
  const where = and(eq(table.id, id), eq(table.organizationId, sdb.auth.orgId), isNull(table.deletedAt));
  const exists = await sdb.db.select({ id: table.id }).from(table).where(where).limit(1);
  if (!exists.length) throw new NotFoundError("No existe");
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db
      .update(table)
      .set({ ...patch, updatedAt: ts, version: currentVersion } as never)
      .where(where),
    ...extra,
  ]);
}

export async function updateFarm(sdb: ScopedDb, id: string, patch: Partial<typeof s.farms.$inferInsert>) {
  sdb.require(can.editField);
  await updateSynced(sdb, s.farms, id, patch);
}

export async function deleteFarm(sdb: ScopedDb, id: string) {
  sdb.require(can.manageOrg, "Solo el dueño borra estancias");
  const ts = sdb.now();
  const org = sdb.auth.orgId;
  const farmPlots = sql`(SELECT id FROM plots WHERE farm_id = ${id} AND organization_id = ${org})`;
  await updateSynced(sdb, s.farms, id, { deletedAt: ts }, [
    ...cascadeStmts(sdb, inArray(s.plotAssignments.plotId, farmPlots), eq(s.tasks.farmId, id), ts),
    sdb.db
      .update(s.plots)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.plots.farmId, id), eq(s.plots.organizationId, org))),
  ]);
}

/**
 * Borrado en cascada de un lote o estancia (B1): sube assignments_version de quienes lo tenían asignado
 * (antes de borrar las asignaciones), borra las asignaciones y cancela las tareas abiertas.
 * 3 sentencias dentro del mismo batch.
 */
function cascadeStmts(sdb: ScopedDb, assignWhere: SQL, taskWhere: SQL, ts: number): Stmt[] {
  const org = sdb.auth.orgId;
  return [
    sdb.db
      .update(s.memberships)
      .set({ assignmentsVersion: sql`${s.memberships.assignmentsVersion} + 1`, updatedAt: ts })
      .where(
        and(
          eq(s.memberships.organizationId, org),
          inArray(
            s.memberships.userId,
            sdb.db
              .select({ u: s.plotAssignments.userId })
              .from(s.plotAssignments)
              .where(and(assignWhere, isNull(s.plotAssignments.deletedAt))),
          ),
        ),
      ),
    sdb.db
      .update(s.plotAssignments)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.plotAssignments.organizationId, org), assignWhere, isNull(s.plotAssignments.deletedAt))),
    sdb.db
      .update(s.tasks)
      .set({ status: "cancelled", updatedAt: ts, version: currentVersion })
      .where(and(eq(s.tasks.organizationId, org), taskWhere, eq(s.tasks.status, "open"), isNull(s.tasks.deletedAt))),
  ];
}

export async function updatePlot(sdb: ScopedDb, id: string, patch: Partial<typeof s.plots.$inferInsert>) {
  sdb.require(can.editField);
  await updateSynced(sdb, s.plots, id, patch);
}

export async function deletePlot(sdb: ScopedDb, id: string) {
  sdb.require(can.editField);
  const ts = sdb.now();
  await updateSynced(
    sdb,
    s.plots,
    id,
    { deletedAt: ts },
    cascadeStmts(sdb, eq(s.plotAssignments.plotId, id), eq(s.tasks.plotId, id), ts),
  );
}

export async function deletePoi(sdb: ScopedDb, id: string) {
  sdb.require(can.editField);
  await updateSynced(sdb, s.pointsOfInterest, id, { deletedAt: sdb.now() });
}

export async function updateTask(sdb: ScopedDb, id: string, patch: Partial<typeof s.tasks.$inferInsert>) {
  sdb.require(can.assign);
  if (patch.assigneeId) await sdb.memberRole(patch.assigneeId);
  await updateSynced(sdb, s.tasks, id, patch);
}

export async function deleteTask(sdb: ScopedDb, id: string) {
  sdb.require(can.assign);
  await updateSynced(sdb, s.tasks, id, { deletedAt: sdb.now() });
}

/** Dar de baja a un miembro: deshabilita la membresía y cierra sus sesiones. */
export async function removeMember(sdb: ScopedDb, userId: string) {
  const role = await sdb.memberRole(userId);
  if (role === "worker") sdb.require(can.manageWorkers);
  else sdb.require(can.manageOrg, "Solo el dueño gestiona miembros");
  if (userId === sdb.auth.userId) throw new ForbiddenError("No podés darte de baja a vos mismo");
  const ts = sdb.now();
  await runBatch(sdb.db, [
    sdb.db
      .update(s.memberships)
      .set({ status: "disabled", deletedAt: ts, updatedAt: ts })
      .where(and(eq(s.memberships.organizationId, sdb.auth.orgId), eq(s.memberships.userId, userId))),
    sdb.db
      .update(s.refreshTokens)
      .set({ revokedAt: ts })
      .where(
        and(
          eq(s.refreshTokens.userId, userId),
          eq(s.refreshTokens.organizationId, sdb.auth.orgId),
          isNull(s.refreshTokens.revokedAt),
        ),
      ),
  ]);
}

// ---------- Dispositivos (push) ----------

export async function registerDevice(
  sdb: ScopedDb,
  d: { id: string; platform: string; appVersion: string | null; pushToken: string | null },
) {
  const [existing] = await sdb.db
    .select({ userId: s.devices.userId })
    .from(s.devices)
    .where(eq(s.devices.id, d.id))
    .limit(1);
  const stmts: Stmt[] = [];
  if (existing && existing.userId !== sdb.auth.userId) {
    // El mismo celular pasó a otro usuario: el token de push queda solo para el nuevo.
    stmts.push(sdb.db.delete(s.devices).where(eq(s.devices.id, d.id)));
  }
  if (d.pushToken) {
    stmts.push(
      sdb.db
        .update(s.devices)
        .set({ pushToken: null })
        .where(and(eq(s.devices.pushToken, d.pushToken), sql`${s.devices.id} <> ${d.id}`)),
    );
  }
  stmts.push(
    sdb.db
      .insert(s.devices)
      .values({ ...d, userId: sdb.auth.userId, lastSyncAt: sdb.now() })
      .onConflictDoUpdate({
        target: s.devices.id,
        set: {
          userId: sdb.auth.userId,
          platform: d.platform,
          appVersion: d.appVersion,
          pushToken: d.pushToken,
          lastSyncAt: sdb.now(),
        },
      }),
  );
  await runBatch(sdb.db, stmts);
}
