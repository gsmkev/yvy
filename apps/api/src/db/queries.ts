/**
 * Consultas de la web y operaciones de edición. Todas reciben ScopedDb y filtran por organización
 * (y por lotes asignados cuando corresponde).
 */
import { and, asc, desc, eq, getTableColumns, gte, inArray, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  DEFAULT_ALERT_SETTINGS,
  isFieldRole,
  LIMITS,
  localDate,
  notifyOptionsFor,
  parseNotificationPrefs,
  parseTaskComments,
  type AlertSettings,
  type NotificationPrefs,
  type PullTable,
  type RecordKind,
  type TaskComment,
} from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bboxOf, checkPlots, type Area } from "@yvy/geo";
import { newId, t, type FormConfig } from "@yvy/shared";
import { HTTPException } from "hono/http-exception";
import { randomToken, sha256Hex } from "../lib/crypto";
import { patchDetail, type AuditEntity } from "./audit";
import { bumpVersion, chunkForParams, currentVersion, runBatch, type Stmt } from "./client";
import { can, ForbiddenError, NotFoundError, SYNCED_KEYS, type ScopedDb } from "./scoped";

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

// ---------- Preferencias de notificación (U-29) ----------

/** Preferencias del usuario de la sesión (valen para todas sus organizaciones) y qué le llega según su rol. */
export async function getNotificationPrefs(sdb: ScopedDb) {
  const [row] = await sdb.db
    .select({ prefs: s.notificationPrefs.prefs })
    .from(s.notificationPrefs)
    .where(eq(s.notificationPrefs.userId, sdb.auth.userId))
    .limit(1);
  const [u] = await sdb.db
    .select({ email: s.users.email })
    .from(s.users)
    .where(eq(s.users.id, sdb.auth.userId))
    .limit(1);
  const opts = notifyOptionsFor(sdb.auth.role);
  return {
    prefs: parseNotificationPrefs(row?.prefs),
    kinds: opts.kinds,
    email: opts.email && !!u?.email,
  };
}

export async function saveNotificationPrefs(sdb: ScopedDb, prefs: NotificationPrefs) {
  const ts = sdb.now();
  await sdb.db
    .insert(s.notificationPrefs)
    .values({ userId: sdb.auth.userId, prefs: JSON.stringify(prefs), updatedAt: ts })
    .onConflictDoUpdate({
      target: s.notificationPrefs.userId,
      set: { prefs: JSON.stringify(prefs), updatedAt: ts },
    });
}

// ---------- Recorrido de primera vez (U-24) ----------

/** El estado de la guía de los 4 pasos es de la persona, no del navegador: se oculta una vez y vale en todos sus dispositivos. */
export async function getOnboarding(sdb: ScopedDb) {
  const [row] = await sdb.db
    .select({ dismissedAt: s.onboardingState.dismissedAt })
    .from(s.onboardingState)
    .where(eq(s.onboardingState.userId, sdb.auth.userId))
    .limit(1);
  return { dismissedAt: row?.dismissedAt ?? null };
}

export async function saveOnboarding(sdb: ScopedDb, dismissed: boolean) {
  const ts = sdb.now();
  const dismissedAt = dismissed ? ts : null;
  await sdb.db
    .insert(s.onboardingState)
    .values({ userId: sdb.auth.userId, dismissedAt, updatedAt: ts })
    .onConflictDoUpdate({ target: s.onboardingState.userId, set: { dismissedAt, updatedAt: ts } });
  return { dismissedAt };
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
        lowConfidence: s.plotIndexStats.lowConfidence,
      })
      .from(s.plotIndexStats)
      .where(and(eq(s.plotIndexStats.plotId, plotId), eq(s.plotIndexStats.idx, "ndvi"), gte(s.plotIndexStats.acquiredAt, since)))
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
          eq(s.plotIndexStats.idx, "ndvi"),
          gte(s.plotIndexStats.acquiredAt, since),
        ),
      )
      .groupBy(s.plotIndexStats.sceneId)
      .orderBy(asc(sql`min(${s.plotIndexStats.acquiredAt})`)),
  ]);
  // S-07: último valor de NDRE, NDMI y EVI (los más recientes de los últimos 60 días)
  const otherRows = await sdb.db
    .select({
      idx: s.plotIndexStats.idx,
      acquiredAt: s.plotIndexStats.acquiredAt,
      mean: s.plotIndexStats.mean,
      lowConfidence: s.plotIndexStats.lowConfidence,
    })
    .from(s.plotIndexStats)
    .where(
      and(
        eq(s.plotIndexStats.plotId, plotId),
        ne(s.plotIndexStats.idx, "ndvi"),
        gte(s.plotIndexStats.acquiredAt, sdb.now() - 60 * 86_400_000),
      ),
    )
    .orderBy(desc(s.plotIndexStats.acquiredAt))
    .limit(60);
  const others: Record<string, { acquiredAt: number; mean: number; lowConfidence: boolean }> = {};
  for (const r of otherRows) others[r.idx] ??= { acquiredAt: r.acquiredAt, mean: r.mean, lowConfidence: r.lowConfidence };
  const last = series[series.length - 1];
  const lastAvg = last && farmAvg.find((a) => a.acquiredAt === last.acquiredAt);
  return {
    series,
    farmAvg,
    current: last ?? null,
    others,
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

// ---------- Formularios configurables (F-14) ----------

/** Campos propios de la organización por tipo de registro. Los lee todo el equipo: el empleado los llena en la app. */
export async function getFormConfig(sdb: ScopedDb): Promise<{ config: FormConfig; updatedAt: number | null }> {
  const [row] = await sdb.db
    .select({ config: s.formConfigs.config, updatedAt: s.formConfigs.updatedAt })
    .from(s.formConfigs)
    .where(eq(s.formConfigs.organizationId, sdb.auth.orgId))
    .limit(1);
  return row ? { config: JSON.parse(row.config) as FormConfig, updatedAt: row.updatedAt } : { config: {}, updatedAt: null };
}

export async function saveFormConfig(sdb: ScopedDb, config: FormConfig): Promise<{ updatedAt: number }> {
  sdb.require(can.manageForms, "Solo el dueño o el administrador definen los formularios");
  const updatedAt = sdb.now();
  const row = { config: JSON.stringify(config), updatedAt, updatedBy: sdb.auth.userId };
  await sdb.db
    .insert(s.formConfigs)
    .values({ organizationId: sdb.auth.orgId, ...row })
    .onConflictDoUpdate({ target: s.formConfigs.organizationId, set: row });
  return { updatedAt };
}

// ---------- Historia de vigor desde 2017 (S-03) ----------

const HISTORY_RETRY_MS = 6 * 3_600_000;
const HISTORY_MAX_ROWS = 3000;

export async function farmHistoryStatus(sdb: ScopedDb, farmId: string) {
  sdb.require(can.viewAll);
  await sdb.requireFarm(farmId);
  const [row] = await sdb.db
    .select({ status: s.farmHistory.status, requestedAt: s.farmHistory.requestedAt, updatedAt: s.farmHistory.updatedAt })
    .from(s.farmHistory)
    .where(and(eq(s.farmHistory.farmId, farmId), eq(s.farmHistory.organizationId, sdb.auth.orgId)))
    .limit(1);
  return row ?? { status: null, requestedAt: null, updatedAt: null };
}

/** Registra el pedido. Devuelve false si ya hay uno en curso (hace menos de 6 h): no se encolan dos. */
export async function markHistoryRequested(sdb: ScopedDb, farmId: string): Promise<boolean> {
  sdb.require(can.requestHistory, "Solo el dueño o el administrador piden la historia");
  await sdb.requireFarm(farmId);
  const cur = await farmHistoryStatus(sdb, farmId);
  const now = sdb.now();
  if (cur.status === "processing" && cur.requestedAt && now - cur.requestedAt < HISTORY_RETRY_MS) return false;
  await sdb.db
    .insert(s.farmHistory)
    .values({ farmId, organizationId: sdb.auth.orgId, status: "processing", requestedAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: s.farmHistory.farmId, set: { status: "processing", requestedAt: now, updatedAt: now } });
  return true;
}

/** El pedido no llegó a salir (GitHub sin configurar o rechazó): vuelve a poder pedirse. */
export async function markHistoryFailed(sdb: ScopedDb, farmId: string): Promise<void> {
  await sdb.db
    .update(s.farmHistory)
    .set({ status: "failed", updatedAt: sdb.now() })
    .where(and(eq(s.farmHistory.farmId, farmId), eq(s.farmHistory.organizationId, sdb.auth.orgId)));
}

// ---------- Análisis por lote: área quemada (S-20) y cambio de cobertura (S-31) ----------

/** Resultados de un tipo de análisis por lote (con el nombre del lote), los más nuevos primero. Solo roles con vista completa. */
export async function farmAnalyses(sdb: ScopedDb, farmId: string, kind: s.AnalysisKind) {
  sdb.require(can.viewAll);
  await sdb.requireFarm(farmId);
  const rows = await sdb.db
    .select({
      plotId: s.plotAnalyses.plotId,
      plotName: s.plots.name,
      refKey: s.plotAnalyses.refKey,
      fromAt: s.plotAnalyses.fromAt,
      toAt: s.plotAnalyses.toAt,
      plotAreaHa: s.plotAnalyses.plotAreaHa,
      validPct: s.plotAnalyses.validPct,
      metrics: s.plotAnalyses.metrics,
      changes: s.plotAnalyses.changes,
      computedAt: s.plotAnalyses.computedAt,
    })
    .from(s.plotAnalyses)
    .innerJoin(s.plots, and(eq(s.plots.id, s.plotAnalyses.plotId), isNull(s.plots.deletedAt)))
    .where(and(eq(s.plotAnalyses.farmId, farmId), eq(s.plotAnalyses.kind, kind), eq(s.plotAnalyses.organizationId, sdb.auth.orgId)))
    .orderBy(desc(s.plotAnalyses.refKey), s.plots.name)
    .limit(500);
  return { plots: rows.map((r) => ({ ...r, metrics: JSON.parse(r.metrics) as Record<string, unknown> })) };
}

export async function analysisStatus(sdb: ScopedDb, farmId: string, kind: s.AnalysisKind) {
  sdb.require(can.viewAll);
  await sdb.requireFarm(farmId);
  const [row] = await sdb.db
    .select({ status: s.analysisJobs.status, params: s.analysisJobs.params, requestedAt: s.analysisJobs.requestedAt })
    .from(s.analysisJobs)
    .where(and(eq(s.analysisJobs.farmId, farmId), eq(s.analysisJobs.kind, kind), eq(s.analysisJobs.organizationId, sdb.auth.orgId)))
    .limit(1);
  return row ? { ...row, params: JSON.parse(row.params) as Record<string, string> } : { status: null, params: null, requestedAt: null };
}

/** Registra el pedido. Devuelve false si ya hay uno en curso (hace menos de 6 h). */
export async function markAnalysisRequested(sdb: ScopedDb, farmId: string, kind: s.AnalysisKind, params: Record<string, string>): Promise<boolean> {
  sdb.require(can.requestAnalysis, "Solo el dueño o el administrador piden este análisis");
  const cur = await analysisStatus(sdb, farmId, kind);
  const now = sdb.now();
  if (cur.status === "processing" && cur.requestedAt && now - cur.requestedAt < HISTORY_RETRY_MS) return false;
  const row = { status: "processing" as const, params: JSON.stringify(params), requestedAt: now, updatedAt: now };
  await sdb.db
    .insert(s.analysisJobs)
    .values({ farmId, kind, organizationId: sdb.auth.orgId, ...row })
    .onConflictDoUpdate({ target: [s.analysisJobs.farmId, s.analysisJobs.kind], set: row });
  return true;
}

export async function markAnalysisFailed(sdb: ScopedDb, farmId: string, kind: s.AnalysisKind): Promise<void> {
  await sdb.db
    .update(s.analysisJobs)
    .set({ status: "failed", updatedAt: sdb.now() })
    .where(and(eq(s.analysisJobs.farmId, farmId), eq(s.analysisJobs.kind, kind), eq(s.analysisJobs.organizationId, sdb.auth.orgId)));
}

/** Vigor (NDVI) de un lote en todas las campañas cargadas, para comparar años. */
export async function plotVigorHistory(sdb: ScopedDb, plotId: string) {
  sdb.require(can.viewAll);
  const [plot] = await sdb.db
    .select({ id: s.plots.id })
    .from(s.plots)
    .where(and(eq(s.plots.id, plotId), eq(s.plots.organizationId, sdb.auth.orgId), isNull(s.plots.deletedAt)))
    .limit(1);
  if (!plot) throw new NotFoundError("Lote inexistente");
  const rows = await sdb.db
    .select({ acquiredAt: s.plotIndexStats.acquiredAt, mean: s.plotIndexStats.mean, lowConfidence: s.plotIndexStats.lowConfidence })
    .from(s.plotIndexStats)
    .where(and(eq(s.plotIndexStats.plotId, plotId), eq(s.plotIndexStats.idx, "ndvi"), isNull(s.plotIndexStats.deletedAt)))
    .orderBy(asc(s.plotIndexStats.acquiredAt))
    .limit(HISTORY_MAX_ROWS);
  return { series: rows };
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

/** S-30: indicador EUDR por lote (calculado por workers-py). Solo roles con vista completa. */
export async function farmEudr(sdb: ScopedDb, farmId: string) {
  sdb.require(can.viewAll);
  await sdb.requireFarm(farmId);
  const rows = await sdb.db
    .select({
      plotId: s.eudrResults.plotId,
      plotName: s.plots.name,
      status: s.eudrResults.status,
      plotAreaHa: s.eudrResults.plotAreaHa,
      forestRefHa: s.eudrResults.forestRefHa,
      lossHa: s.eudrResults.lossHa,
      validPct: s.eudrResults.validPct,
      refYear: s.eudrResults.refYear,
      curYear: s.eudrResults.curYear,
      refFromAt: s.eudrResults.refFromAt,
      refToAt: s.eudrResults.refToAt,
      curFromAt: s.eudrResults.curFromAt,
      curToAt: s.eudrResults.curToAt,
      refScenes: s.eudrResults.refScenes,
      curScenes: s.eudrResults.curScenes,
      changes: s.eudrResults.changes,
      computedAt: s.eudrResults.computedAt,
    })
    .from(s.eudrResults)
    .innerJoin(s.plots, and(eq(s.plots.id, s.eudrResults.plotId), isNull(s.plots.deletedAt)))
    .where(and(eq(s.eudrResults.farmId, farmId), eq(s.eudrResults.organizationId, sdb.auth.orgId)))
    .orderBy(desc(s.eudrResults.lossHa), s.plots.name)
    .limit(500);
  return { computedAt: rows.reduce<number | null>((m, r) => (m === null || r.computedAt > m ? r.computedAt : m), null), plots: rows };
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

// ---------- Tablero del dueño (R-06) ----------

/**
 * Cifras sueltas para el inicio del dueño con varias estancias: superficie por cultivo, lluvia del mes contra lo
 * normal, avisos activos, actividad del equipo en la semana y registros de la semana. 7 consultas agregadas,
 * sin recorrer estancia por estancia.
 */
export async function ownerDashboard(sdb: ScopedDb) {
  sdb.require(can.dashboard, "El tablero es para dueño y administrador");
  const org = sdb.auth.orgId;
  const now = sdb.now();
  const week = now - 7 * 86_400_000;
  const today = localDate(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  // K-05: el administrador con estancias limitadas ve el tablero de esas estancias
  const farmIds = sql`(SELECT id FROM farms WHERE organization_id = ${org} AND deleted_at IS NULL AND ${sdb.farmScopeSql("farms.id") ?? sql`1`})`;
  const [byCrop, rain, normal, alerts, members, records] = await Promise.all([
    sdb.db.all<{ crop: string | null; kind: string; ha: number; plots: number }>(sql`
      SELECT crop, kind, sum(area_ha) AS ha, count(*) AS plots FROM plots
      WHERE organization_id = ${org} AND deleted_at IS NULL AND farm_id IN ${farmIds}
      GROUP BY crop, kind ORDER BY ha DESC`),
    // Lluvia del mes por estancia (promedio entre fuentes de un mismo día para no contar dos veces)
    sdb.db.all<{ farm_id: string; mm: number }>(sql`
      SELECT farm_id, sum(p) AS mm FROM (
        SELECT farm_id, date, avg(precip_mm) AS p FROM climate_daily
        WHERE plot_id = '' AND date >= ${monthStart} AND date <= ${today} AND precip_mm IS NOT NULL AND farm_id IN ${farmIds}
        GROUP BY farm_id, date) GROUP BY farm_id`),
    sdb.db.all<{ farm_id: string; mm: number }>(sql`
      SELECT farm_id, sum(mean) AS mm FROM climatology
      WHERE plot_id = '' AND var = 'precip' AND mean IS NOT NULL AND farm_id IN ${farmIds}
        AND day_of_year BETWEEN ${dayOfYear(monthStart)} AND ${dayOfYear(today)}
      GROUP BY farm_id`),
    sdb.db.all<{ kind: string; severity: string; n: number }>(sql`
      SELECT kind, severity, count(*) AS n FROM alerts
      WHERE organization_id = ${org} AND resolved_at IS NULL AND (valid_to IS NULL OR valid_to >= ${now}) AND farm_id IN ${farmIds}
      GROUP BY kind, severity`),
    sdb.db.all<{ role: string; total: number; active: number }>(sql`
      SELECT m.role, count(*) AS total,
        sum(EXISTS (SELECT 1 FROM activity_daily a WHERE a.user_id = m.user_id AND a.organization_id = ${org} AND a.day >= ${localDate(week)})) AS active
      FROM memberships m WHERE m.organization_id = ${org} AND m.deleted_at IS NULL AND m.status = 'active' GROUP BY m.role`),
    sdb.db.all<{ kind: string; n: number; byWorkers: number }>(sql`
      SELECT r.kind, count(*) AS n,
        sum(EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = r.author_id AND m.organization_id = ${org} AND m.role = 'worker')) AS byWorkers
      FROM records r WHERE r.organization_id = ${org} AND r.deleted_at IS NULL AND r.captured_at >= ${week} AND r.farm_id IN ${farmIds} GROUP BY r.kind ORDER BY n DESC`),
  ]);
  // Lluvia: solo estancias con dato real y normal a la vez, así la comparación es entre lo mismo
  const normalBy = new Map(normal.map((r) => [r.farm_id, Number(r.mm)]));
  const both = rain.filter((r) => normalBy.has(r.farm_id));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const rainMm = avg(both.map((r) => Number(r.mm)));
  const normalMm = avg(both.map((r) => normalBy.get(r.farm_id)!));
  const workers = members.find((m) => m.role === "worker");
  // Margen de los últimos 12 meses (ventas menos costos, en Gs.). Son montos: solo con el permiso del ERP.
  let margin: { incomePyg: number; costPyg: number; marginPyg: number; entries: number; sinceMs: number } | null = null;
  if (can.manageErp(sdb.auth.role)) {
    const sinceMs = now - 365 * 86_400_000;
    const farmScope = sdb.farmScopeSql("cost_entries.farm_id");
    const [m] = await sdb.db.all<{ income: number; cost: number; n: number }>(sql`
      SELECT coalesce(sum(CASE WHEN category = 'sale' THEN amount_pyg END), 0) AS income,
        coalesce(sum(CASE WHEN category <> 'sale' THEN amount_pyg END), 0) AS cost, count(*) AS n
      FROM cost_entries
      WHERE organization_id = ${org} AND deleted_at IS NULL AND occurred_at >= ${sinceMs} AND ${farmScope ?? sql`1`}`);
    const income = Number(m?.income ?? 0);
    const cost = Number(m?.cost ?? 0);
    margin = { incomePyg: income, costPyg: cost, marginPyg: income - cost, entries: Number(m?.n ?? 0), sinceMs };
  }
  return {
    generatedAt: now,
    margin,
    areaByCrop: byCrop.map((r) => ({ crop: r.crop, kind: r.kind, ha: Number(r.ha), plots: Number(r.plots) })),
    rain: {
      month: monthStart.slice(0, 7),
      farmsWithData: both.length,
      mm: rainMm,
      normalMm,
      pctOfNormal: rainMm !== null && normalMm ? Math.round((100 * rainMm) / normalMm) : null,
    },
    alerts: {
      total: alerts.reduce((a, r) => a + Number(r.n), 0),
      byKind: alerts.map((r) => ({ kind: r.kind, severity: r.severity, n: Number(r.n) })),
    },
    activity: {
      workers: Number(workers?.total ?? 0),
      activeWorkers7d: Number(workers?.active ?? 0),
      staff: members.filter((m) => !isFieldRole(m.role)).reduce((a, m) => a + Number(m.total), 0),
      activeStaff7d: members.filter((m) => !isFieldRole(m.role)).reduce((a, m) => a + Number(m.active), 0),
    },
    records7d: {
      total: records.reduce((a, r) => a + Number(r.n), 0),
      byWorkers: records.reduce((a, r) => a + Number(r.byWorkers), 0),
      byKind: records.map((r) => ({ kind: r.kind, n: Number(r.n) })),
    },
  };
}

// ---------- Registro de cambios (K-06) ----------

/** El dueño ve quién cambió qué y cuándo, de más nuevo a más viejo; `before` (epoch ms) pagina. */
export async function listAudit(sdb: ScopedDb, f: { entity?: string; before?: number; limit?: number }) {
  sdb.require(can.viewAudit, "Solo el dueño ve el registro de cambios");
  const limit = Math.min(f.limit ?? LIMITS.audit.pageSize, 200);
  const rows = await sdb.db
    .select({
      id: s.auditLog.id,
      action: s.auditLog.action,
      entity: s.auditLog.entity,
      entityId: s.auditLog.entityId,
      detail: s.auditLog.detail,
      createdAt: s.auditLog.createdAt,
      actorId: s.auditLog.actorUserId,
      actor: s.users.fullName,
    })
    .from(s.auditLog)
    .leftJoin(s.users, eq(s.users.id, s.auditLog.actorUserId))
    .where(
      and(
        eq(s.auditLog.organizationId, sdb.auth.orgId),
        // las acciones del equipo de Yvy (soporte, plan) no llevan entidad y no son del dueño
        sql`${s.auditLog.entity} IS NOT NULL`,
        f.entity ? eq(s.auditLog.entity, f.entity) : undefined,
        f.before ? lt(s.auditLog.createdAt, f.before) : undefined,
      ),
    )
    .orderBy(desc(s.auditLog.createdAt), desc(s.auditLog.id))
    .limit(limit + 1);
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

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

const AUDITED: Partial<Record<PullTable, AuditEntity>> = {
  farms: "farm",
  plots: "plot",
  tasks: "task",
  points_of_interest: "poi",
  products: "product",
  seasons: "season",
};

export async function updateSynced(
  sdb: ScopedDb,
  table: SyncedTbl,
  id: string,
  patch: Record<string, unknown>,
  extra: Stmt[] = [],
) {
  const ts = sdb.now();
  // T-09 / K-05: solo filas de estancias donde puede escribir (las tablas fuera de SYNCED no llevan estancia).
  const key = SYNCED_KEYS.get(table);
  const where = and(
    eq(table.id, id),
    eq(table.organizationId, sdb.auth.orgId),
    isNull(table.deletedAt),
    key ? sdb.workerFilter(key, true) : undefined,
  );
  const exists = await sdb.db.select({ id: table.id }).from(table).where(where).limit(1);
  if (!exists.length) throw new NotFoundError("No existe");
  // K-06: queda en el registro de cambios quién editó o borró qué
  const entity = key && AUDITED[key];
  const deleting = patch.deletedAt != null;
  const audit = entity
    ? sdb.audit({ action: `${entity}_${deleting ? "delete" : "update"}`, entity, entityId: id, detail: deleting ? {} : patchDetail(patch) })
    : [];
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    ...audit,
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
    // A-23: las entregas a acopio se van con la estancia
    sdb.db
      .update(s.grainDeliveries)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.grainDeliveries.farmId, id), eq(s.grainDeliveries.organizationId, org), isNull(s.grainDeliveries.deletedAt))),
    // A-30: los análisis de suelo se van con la estancia
    sdb.db
      .update(s.soilSamples)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.soilSamples.farmId, id), eq(s.soilSamples.organizationId, org), isNull(s.soilSamples.deletedAt))),
    // M-20: las líneas del mapa se van con la estancia
    sdb.db
      .update(s.farmLines)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.farmLines.farmId, id), eq(s.farmLines.organizationId, org), isNull(s.farmLines.deletedAt))),
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

/**
 * Avisos no bloqueantes de un lote ya guardado (M-02): cuánto se superpone con los vecinos de su estancia y si
 * sale del perímetro. Presupuesto de CPU: solo vecinos cuyo bbox toca al lote y como máximo 12 recortes exactos.
 */
export async function plotGeometryWarnings(sdb: ScopedDb, plotId: string, geometry: Area) {
  const org = sdb.auth.orgId;
  const [own] = await sdb.db
    .select({ farmId: s.plots.farmId })
    .from(s.plots)
    .where(and(eq(s.plots.id, plotId), eq(s.plots.organizationId, org)))
    .limit(1);
  if (!own) throw new NotFoundError("No existe");
  const box = bboxOf(geometry);
  const [farm] = await sdb.db
    .select({ geometry: s.farms.geometry })
    .from(s.farms)
    .where(and(eq(s.farms.id, own.farmId), eq(s.farms.organizationId, org)))
    .limit(1);
  const neighbors = await sdb.db
    .select({ id: s.plots.id, name: s.plots.name, geometry: s.plots.geometry })
    .from(s.plots)
    .where(
      and(
        eq(s.plots.organizationId, org),
        eq(s.plots.farmId, own.farmId),
        isNull(s.plots.deletedAt),
        sql`${s.plots.id} <> ${plotId}`,
        lte(s.plots.minLon, box.maxLon),
        gte(s.plots.maxLon, box.minLon),
        lte(s.plots.minLat, box.maxLat),
        gte(s.plots.maxLat, box.minLat),
      ),
    )
    .limit(12);
  const found = checkPlots(
    [geometry, ...neighbors.map((n) => JSON.parse(n.geometry) as Area)],
    farm ? (JSON.parse(farm.geometry) as Area) : null,
    { maxExact: 12 },
  );
  return found
    .filter((w) => w.a === 0 || w.b === 0)
    .map((w) =>
      w.kind === "outside"
        ? { kind: "outside" as const, ratio: Math.round(w.ratio * 1000) / 1000 }
        : {
            kind: "overlap" as const,
            plotId: neighbors[(w.a === 0 ? w.b! : w.a) - 1]!.id,
            plotName: neighbors[(w.a === 0 ? w.b! : w.a) - 1]!.name,
            ratio: Math.round(w.ratio * 1000) / 1000,
          },
    );
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

type PlotGeo = { geometry: string; minLon: number; minLat: number; maxLon: number; maxLat: number; areaHa: number };

/** Tolerancia entre la superficie original y la de las partes (el cliente corta en grados, el servidor mide geodésico). */
const AREA_TOLERANCE = 0.02;

/**
 * Reemplaza uno o dos lotes por lotes nuevos (dividir / unir, M-05). Los nuevos heredan tipo, cultivo, campaña,
 * siembra, pasto y color del primer lote original, y quienes tenían asignado un original reciben los nuevos.
 * Los originales se borran lógicamente con la misma cascada que deletePlot (asignaciones y tareas abiertas).
 * Los registros históricos quedan apuntando al lote original (ya borrado). Lecturas: 2. Un solo batch.
 */
async function replacePlots(
  sdb: ScopedDb,
  originalIds: string[],
  made: ({ name: string } & PlotGeo)[],
  expectedAreaHa: (originals: { areaHa: number }[]) => [number, number],
) {
  sdb.require(can.editField);
  const org = sdb.auth.orgId;
  const originals = await sdb.db
    .select()
    .from(s.plots)
    .where(and(eq(s.plots.organizationId, org), inArray(s.plots.id, originalIds), isNull(s.plots.deletedAt)));
  if (originals.length !== originalIds.length) throw new NotFoundError("No existe");
  if (new Set(originals.map((p) => p.farmId)).size !== 1) throw new HTTPException(400, { message: t("ui.plotsOtherFarm") });
  const [lo, hi] = expectedAreaHa(originals);
  const total = made.reduce((a, p) => a + p.areaHa, 0);
  if (total < lo * (1 - AREA_TOLERANCE) || total > hi * (1 + AREA_TOLERANCE))
    throw new HTTPException(400, { message: t("ui.plotsAreaMismatch") });
  const base = originals.find((p) => p.id === originalIds[0])!;
  const assigned = await sdb.db
    .select({ userId: s.plotAssignments.userId })
    .from(s.plotAssignments)
    .where(
      and(
        eq(s.plotAssignments.organizationId, org),
        inArray(s.plotAssignments.plotId, originalIds),
        isNull(s.plotAssignments.deletedAt),
      ),
    );
  const users = [...new Set(assigned.map((a) => a.userId))];
  const ts = sdb.now();
  const ids = made.map(() => newId());
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    ...made.map((p, i) =>
      sdb.db.insert(s.plots).values({
        ...p,
        id: ids[i]!,
        organizationId: org,
        farmId: base.farmId,
        kind: base.kind,
        crop: base.crop,
        season: base.season,
        sowingDate: base.sowingDate,
        pastureType: base.pastureType,
        color: base.color,
        createdAt: ts,
        updatedAt: ts,
        version: currentVersion,
      }),
    ),
    ...ids.flatMap((plotId) =>
      users.map((userId) =>
        sdb.db.insert(s.plotAssignments).values({
          id: newId(),
          organizationId: org,
          plotId,
          userId,
          createdAt: ts,
          updatedAt: ts,
          version: currentVersion,
        }),
      ),
    ),
    // Primero se suben las versiones de asignaciones y se borran las viejas, igual que al borrar un lote
    ...cascadeStmts(sdb, inArray(s.plotAssignments.plotId, originalIds), inArray(s.tasks.plotId, originalIds), ts),
    sdb.db
      .update(s.plots)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.plots.organizationId, org), inArray(s.plots.id, originalIds))),
    ...sdb.audit({
      action: originalIds.length === 1 ? "plot_split" : "plot_merge",
      entity: "plot",
      entityId: originalIds[0]!,
      detail: { from: originalIds, to: ids },
    }),
  ]);
  return { ids };
}

/** M-05: divide un lote en dos. La forma de las partes viene del cliente (packages/geo); acá solo se valida la superficie. */
export function splitPlot(sdb: ScopedDb, id: string, parts: ({ name: string } & PlotGeo)[]) {
  return replacePlots(sdb, [id], parts, ([o]) => [o!.areaHa, o!.areaHa]);
}

/** M-05: une dos lotes contiguos en uno (la superficie puede ser algo menor si se superponían). */
export function mergePlots(sdb: ScopedDb, ids: [string, string], merged: { name: string } & PlotGeo) {
  return replacePlots(sdb, ids, [merged], (os) => [Math.max(...os.map((o) => o.areaHa)), os[0]!.areaHa + os[1]!.areaHa]);
}

export async function deletePoi(sdb: ScopedDb, id: string) {
  sdb.require(can.editField);
  await updateSynced(sdb, s.pointsOfInterest, id, { deletedAt: sdb.now() });
}

export async function updateTask(sdb: ScopedDb, id: string, patch: Partial<typeof s.tasks.$inferInsert>) {
  sdb.require(can.assign);
  if (patch.assigneeId) await sdb.memberRole(patch.assigneeId);
  if (patch.plotId) {
    // El lote tiene que ser de la organización y de la misma estancia que la tarea
    const [task] = await sdb.db
      .select({ farmId: s.tasks.farmId })
      .from(s.tasks)
      .where(and(eq(s.tasks.id, id), eq(s.tasks.organizationId, sdb.auth.orgId), isNull(s.tasks.deletedAt)))
      .limit(1);
    if (!task) throw new NotFoundError("No existe");
    const [plot] = await sdb.db
      .select({ id: s.plots.id })
      .from(s.plots)
      .where(
        and(
          eq(s.plots.id, patch.plotId),
          eq(s.plots.organizationId, sdb.auth.orgId),
          eq(s.plots.farmId, task.farmId),
          isNull(s.plots.deletedAt),
        ),
      )
      .limit(1);
    if (!plot) throw new NotFoundError("Lote inexistente");
  }
  await updateSynced(sdb, s.tasks, id, patch);
}

/**
 * Agrega un comentario a la tarea (T-02). Los comentarios son un JSON dentro de la tarea: se reescribe con
 * bumpVersion para que baje al celular. Lectura y escritura son dos pasos; si dos personas comentan a la vez
 * gana la última escritura (aceptable con ≤ 50 comentarios de uso ocasional).
 */
export async function addTaskComment(sdb: ScopedDb, id: string, text: string) {
  const [row] = await sdb.db
    .select({ comments: s.tasks.comments })
    .from(s.tasks)
    .where(
      and(
        eq(s.tasks.id, id),
        eq(s.tasks.organizationId, sdb.auth.orgId),
        isNull(s.tasks.deletedAt),
        sdb.workerFilter("tasks"),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("No existe");
  const list = parseTaskComments(row.comments);
  if (list.length >= LIMITS.tasks.maxComments) throw new ForbiddenError("La tarea ya tiene demasiados comentarios");
  const [u] = await sdb.db
    .select({ fullName: s.users.fullName })
    .from(s.users)
    .where(eq(s.users.id, sdb.auth.userId))
    .limit(1);
  const comment: TaskComment = { id: newId(), userId: sdb.auth.userId, name: u?.fullName ?? "", at: sdb.now(), text };
  await updateSynced(sdb, s.tasks, id, { comments: JSON.stringify([...list, comment]) });
  return comment;
}

export async function deleteTask(sdb: ScopedDb, id: string) {
  sdb.require(can.assign);
  await updateSynced(sdb, s.tasks, id, { deletedAt: sdb.now() });
}

/** Dar de baja a un miembro: deshabilita la membresía y cierra sus sesiones. */
export async function removeMember(sdb: ScopedDb, userId: string) {
  const role = await sdb.memberRole(userId);
  if (isFieldRole(role)) sdb.require(can.manageWorkers);
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
    ...sdb.audit({ action: "member_remove", entity: "member", entityId: userId, detail: { role } }),
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
