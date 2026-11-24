/**
 * Job de pronóstico: baja MET Norway, guarda las corridas y evalúa helada, exceso de lluvia, roya y estrés térmico.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { LIMITS, localDate } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { runBatch, type DB } from "../db/client";
import { withPlanCrops } from "../db/plan-crops";
import { SystemDb } from "../db/system";
import type { Bindings } from "../types";
import { saveForecastStmts, saveHourlyStmts, upsertAlert } from "./alerts";
import type { Farm, JobDeps } from "./farm";
import { evaluateHeatStress } from "./heat";
import { evaluateExcessRain, evaluateFrost } from "./rules";
import { evaluateRust } from "./rust";
import { dailyFromMet, hourlyFromMet, fetchMet, type DailyForecast } from "./weather";

/** Últimas `limit` corridas del pronóstico diario de la estancia, la más reciente primero. */
export async function recentRuns(db: DB, farmId: string, limit: number): Promise<DailyForecast[][]> {
  const runs = await db
    .selectDistinct({ runAt: s.forecasts.runAt })
    .from(s.forecasts)
    .where(eq(s.forecasts.farmId, farmId))
    .orderBy(desc(s.forecasts.runAt))
    .limit(limit);
  if (!runs.length) return [];
  const rows = await db
    .select()
    .from(s.forecasts)
    .where(
      and(
        eq(s.forecasts.farmId, farmId),
        inArray(
          s.forecasts.runAt,
          runs.map((r) => r.runAt),
        ),
      ),
    );
  return runs.map((r) =>
    rows
      .filter((x) => x.runAt === r.runAt)
      .map((x) => ({
        date: x.validDate,
        tminC: x.tminC,
        tmaxC: x.tmaxC,
        precipMm: x.precipMm ?? 0,
        windKmh: x.windKmh,
        windDirDeg: x.windDirDeg,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  );
}

/** Pronóstico MET Norway → helada y exceso de lluvia. */
export async function forecastJob(db: DB, env: Bindings, deps: JobDeps, farm: Farm): Promise<void> {
  const now = deps.now();
  const met = await fetchMet(deps.fetch, env.MET_USER_AGENT, farm.lat, farm.lon);
  const days = dailyFromMet(met, farm.tz);
  const hours = hourlyFromMet(met, now, LIMITS.weather.hourlyHorizonHours);
  await runBatch(db, [
    ...saveForecastStmts(db, farm.id, now, days, LIMITS.weather.forecastRunsKept),
    ...saveHourlyStmts(db, farm.id, hours),
  ]);
  const runs = await recentRuns(db, farm.id, LIMITS.weather.forecastRunsKept);
  const today = localDate(now, farm.tz);
  const cfg = await new SystemDb(db).alertSettings(farm.id);
  // Roya asiática solo si la estancia tiene soja
  const soy = (
    await withPlanCrops(
      db,
      await db
        .select({ id: s.plots.id, crop: s.plots.crop })
        .from(s.plots)
        .where(and(eq(s.plots.farmId, farm.id), eq(s.plots.kind, "crop"), isNull(s.plots.deletedAt))),
    )
  ).filter((p) => p.crop === "soja");
  for (const draft of [
    evaluateFrost(runs, today, cfg.frostTminC),
    evaluateExcessRain(days, today, cfg.excessRainMm24h),
    evaluateRust(hours, farm.tz, soy.map((p) => p.id)),
  ]) {
    if (draft) await upsertAlert(db, farm, draft, now);
  }
  // Estrés térmico del ganado (THI). Solo para estancias con potreros, y el aviso es de los potreros.
  const heat = evaluateHeatStress(hours, now, farm.tz);
  if (heat) {
    const pastures = await db
      .select({ id: s.plots.id })
      .from(s.plots)
      .where(and(eq(s.plots.farmId, farm.id), eq(s.plots.kind, "pasture"), isNull(s.plots.deletedAt)));
    if (pastures.length) {
      heat.details.plotIds = pastures.map((p) => p.id);
      await upsertAlert(db, farm, heat, now);
    }
  }
}

