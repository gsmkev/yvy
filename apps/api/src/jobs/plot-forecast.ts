/**
 * Pronóstico por lote en estancias grandes (C-03). Un mensaje de la cola por lote: pide a MET Norway el pronóstico
 * del centro del lote (coordenadas a 4 decimales, User-Agent propio) y guarda los días de la última corrida.
 * Respeta los términos de MET Norway: no vuelve a pedir un lote con una corrida de menos de 3 horas.
 */
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { LIMITS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { runBatch, type DB } from "../db/client";
import type { Bindings } from "../types";
import { dailyFromMet, fetchMet } from "./weather";

/** Lotes que reciben pronóstico propio: los de estancias grandes, hasta el tope por estancia (los más grandes primero). */
export async function plotsNeedingForecast(db: DB): Promise<{ farmId: string; plotId: string }[]> {
  const rows = await db
    .select({ farmId: s.plots.farmId, plotId: s.plots.id, areaHa: s.plots.areaHa })
    .from(s.plots)
    .innerJoin(s.farms, eq(s.farms.id, s.plots.farmId))
    .where(
      and(
        gt(s.farms.areaHa, LIMITS.weather.plotForecastMinFarmHa),
        isNull(s.farms.deletedAt),
        isNull(s.plots.deletedAt),
        eq(s.plots.kind, "crop"),
      ),
    )
    .orderBy(desc(s.plots.areaHa));
  const perFarm = new Map<string, number>();
  return rows
    .filter((r) => {
      const n = perFarm.get(r.farmId) ?? 0;
      perFarm.set(r.farmId, n + 1);
      return n < LIMITS.weather.plotForecastMaxPlots;
    })
    .map(({ farmId, plotId }) => ({ farmId, plotId }));
}

export async function plotForecastJob(
  db: DB,
  env: Bindings,
  deps: { fetch: typeof fetch; now: () => number },
  farm: { id: string; tz: string },
  plotId: string,
): Promise<"fetched" | "cached" | "skipped"> {
  const now = deps.now();
  const [plot] = await db
    .select({
      minLon: s.plots.minLon,
      maxLon: s.plots.maxLon,
      minLat: s.plots.minLat,
      maxLat: s.plots.maxLat,
      farmHa: s.farms.areaHa,
    })
    .from(s.plots)
    .innerJoin(s.farms, eq(s.farms.id, s.plots.farmId))
    .where(and(eq(s.plots.id, plotId), eq(s.plots.farmId, farm.id), isNull(s.plots.deletedAt)))
    .limit(1);
  if (!plot || plot.farmHa <= LIMITS.weather.plotForecastMinFarmHa) return "skipped";
  const [last] = await db
    .select({ runAt: s.plotForecasts.runAt })
    .from(s.plotForecasts)
    .where(eq(s.plotForecasts.plotId, plotId))
    .orderBy(desc(s.plotForecasts.runAt))
    .limit(1);
  if (last && now - last.runAt < LIMITS.weather.forecastCacheMs) return "cached";
  // Centro del recuadro del lote: MET Norway tiene una grilla de ~1 km, no hace falta el centroide exacto.
  const lat = (plot.minLat + plot.maxLat) / 2;
  const lon = (plot.minLon + plot.maxLon) / 2;
  const days = dailyFromMet(await fetchMet(deps.fetch, env.MET_USER_AGENT, lat, lon), farm.tz).slice(
    0,
    LIMITS.weather.plotForecastDays,
  );
  if (!days.length) return "skipped";
  await runBatch(db, [
    db.delete(s.plotForecasts).where(eq(s.plotForecasts.plotId, plotId)),
    // 8 columnas por fila × 10 días = 80 parámetros (límite 100)
    db.insert(s.plotForecasts).values(
      days.map((d) => ({
        plotId,
        farmId: farm.id,
        validDate: d.date,
        runAt: now,
        tminC: d.tminC,
        tmaxC: d.tmaxC,
        precipMm: d.precipMm,
        windKmh: d.windKmh,
      })),
    ),
  ]);
  return "fetched";
}
