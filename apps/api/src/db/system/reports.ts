/** Parte semanal: resumen y PDF. */
import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { addDays, newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { dayOfYear, ndviAt } from "../queries";
import { runBatch } from "../client";
import type { SystemDb } from "./index";

/**
 * R-02: datos del parte semanal de una estancia para el PDF que arma workers-py. Son pocas consultas
 * agregadas; el armado del PDF (lo pesado) no pasa por el Worker. `from` y `to` son fechas locales (UTC-3).
 */
export async function weeklySummary(sys: SystemDb, farmId: string, from: string, to: string) {
  const [farm] = await sys.db
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
    sys.db.select({ kind: s.records.kind, n: sql<number>`count(*)` }).from(s.records).where(inWeek).groupBy(s.records.kind),
    sys.db.select({ n: sql<number>`count(DISTINCT ${s.records.authorId})` }).from(s.records).where(inWeek),
    sys.db
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
    sys.db
      .select({ mean: s.climatology.mean })
      .from(s.climatology)
      .where(
        and(eq(s.climatology.farmId, farmId), eq(s.climatology.plotId, ""), eq(s.climatology.variable, "precip"), inArray(s.climatology.dayOfYear, doys)),
      ),
    sys.db
      .select({ data: s.records.data })
      .from(s.records)
      .where(and(inWeek, eq(s.records.kind, "rain"))),
    sys.db
      .select({ kind: s.alerts.kind, severity: s.alerts.severity, summary: s.alerts.summary })
      .from(s.alerts)
      .where(and(eq(s.alerts.farmId, farmId), gte(s.alerts.updatedAt, fromMs)))
      .limit(20),
    sys.db
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
    sys.db
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
export async function saveWeeklyReport(sys: SystemDb, farmId: string, periodStart: string, periodEnd: string, storagePath: string, now: number) {
  const [farm] = await sys.db
    .select({ org: s.farms.organizationId })
    .from(s.farms)
    .where(and(eq(s.farms.id, farmId), isNull(s.farms.deletedAt)))
    .limit(1);
  if (!farm) return false;
  await runBatch(sys.db, [
    sys.db
      .delete(s.reports)
      .where(and(eq(s.reports.farmId, farmId), eq(s.reports.kind, "weekly"), eq(s.reports.periodStart, periodStart))),
    sys.db.insert(s.reports).values({
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
export async function latestWeeklyReport(sys: SystemDb, farmId: string, now: number, maxAgeMs: number) {
  const [r] = await sys.db
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
