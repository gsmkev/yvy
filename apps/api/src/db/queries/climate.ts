/** Clima, pronóstico e informe de riesgo climático. */
import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { chunkForParams } from "../client";
import { can, NotFoundError, type ScopedDb } from "../scoped";

// ---------- Clima ----------

/** Clima diario de una estancia de los últimos `days` días, con la última corrida y el pluviómetro. */
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
    // Lluvia de pluviómetro cargada por los empleados.
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

/** Último pronóstico de la estancia, liviano, para que la app lo guarde y lo lea sin señal. */
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

/** Informe de riesgo climático ya calculado (workers-py). Solo roles con vista completa. */
export async function farmRiskReport(sdb: ScopedDb, farmId: string) {
  sdb.require(can.viewAll);
  await sdb.requireFarm(farmId);
  const [row] = await sdb.db.select().from(s.farmRisk).where(eq(s.farmRisk.farmId, farmId)).limit(1);
  if (!row) return { computedAt: null, report: null };
  return { computedAt: row.computedAt, report: JSON.parse(row.report) as unknown };
}

/** Día del año (1 a 366) de una fecha `YYYY-MM-DD`. */
export const dayOfYear = (date: string): number => {
  const d = Date.parse(`${date}T00:00:00Z`);
  return Math.floor((d - Date.parse(`${date.slice(0, 4)}-01-01T00:00:00Z`)) / 86_400_000) + 1;
};
