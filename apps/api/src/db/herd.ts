/**
 * Ganadería, segunda tanda (gan-p2): consultas de estrés térmico, abigeato, suplementación, pesadas,
 * reproducción, rotación y oferta de pasto. Cada función hace pocas consultas (presupuesto D1) y pasa por ScopedDb.
 */
import { and, asc, eq, gte } from "drizzle-orm";
import { HEAT_ALERT, HEAT_THRESHOLDS, heatHours, summarizeHeat, type FarmHeatStressResponse } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import type { ScopedDb } from "./scoped";

/** G-32: THI de las próximas 48 horas con el pronóstico horario guardado (MET Norway). */
export async function farmHeatStress(sdb: ScopedDb, farmId: string): Promise<FarmHeatStressResponse> {
  await sdb.requireFarmVisible(farmId);
  const now = sdb.now();
  const from = now - (now % 3_600_000);
  const rows = await sdb.db
    .select({ validAt: s.forecastHours.validAt, tempC: s.forecastHours.tempC, humidityPct: s.forecastHours.humidityPct })
    .from(s.forecastHours)
    .where(and(eq(s.forecastHours.farmId, farmId), gte(s.forecastHours.validAt, from)))
    .orderBy(asc(s.forecastHours.validAt))
    .limit(HEAT_ALERT.windowHours);
  const hours = heatHours(rows);
  return {
    hours,
    summary: summarizeHeat(hours, from),
    thresholds: HEAT_THRESHOLDS,
    windowHours: HEAT_ALERT.windowHours,
  };
}
