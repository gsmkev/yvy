/** Satélite: vigor (NDVI), historia, análisis por lote, áreas problema y EUDR. */
import { and, asc, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { LIMITS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { can, NotFoundError, type ScopedDb } from "../scoped";

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
