/**
 * Ventana de siembra (A-05): por día de los próximos días, si conviene sembrar según la humedad del suelo
 * (NASA POWER, GWETTOP en fracción de saturación 0-1), la lluvia y la temperatura mínima del pronóstico (MET Norway).
 * Los umbrales están en LIMITS.sowing y son valores de referencia: la decisión es del agrónomo.
 */
import { LIMITS } from "./limits";
import type { CROPS } from "./schema";

type Crop = (typeof CROPS)[number];

export type SowingBlock = "rain_day" | "cold" | "dry" | "saturated";

export interface SowingDay {
  date: string;
  ok: boolean;
  reasons: SowingBlock[];
  /** Lluvia a la vista: se puede sembrar en suelo justo porque llueve en los próximos días. */
  rainAhead: boolean;
}

export interface SowingWindowResult {
  /** null = sin dato de humedad del suelo: no se bloquea por seco ni por encharcado. */
  soil: number | null;
  days: SowingDay[];
  /** Primera racha de días aptos consecutivos. */
  best: { from: string; to: string } | null;
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * `forecast` ordenado por fecha, desde hoy. Un día es apto si no llueve fuerte, no hace demasiado frío y el suelo
 * tiene humedad para germinar (o llueve lo suficiente en los próximos días para compensar).
 */
export function sowingWindow(
  crop: Crop,
  soilTop: number | null,
  forecast: { date: string; tminC: number | null; precipMm: number | null }[],
): SowingWindowResult {
  const L = LIMITS.sowing;
  const minTmin = L.minTminC[crop] ?? 10;
  const days: SowingDay[] = forecast.map((d, i) => {
    const reasons: SowingBlock[] = [];
    const rain = d.precipMm ?? 0;
    // lluvia acumulada del día y los dos siguientes
    const ahead = forecast.slice(i, i + 3).reduce((a, x) => a + (x.precipMm ?? 0), 0);
    const rainAhead = ahead >= L.rainAheadMm;
    if (rain >= L.heavyRainDayMm) reasons.push("rain_day");
    if (d.tminC !== null && d.tminC < minTmin) reasons.push("cold");
    if (soilTop !== null && soilTop < L.soilMinFraction && !rainAhead) reasons.push("dry");
    if (soilTop !== null && soilTop > L.soilMaxFraction) reasons.push("saturated");
    return { date: d.date, ok: reasons.length === 0, reasons, rainAhead };
  });
  let best: SowingWindowResult["best"] = null;
  for (let i = 0; i < days.length && !best; i++) {
    if (!days[i]!.ok) continue;
    let j = i;
    while (days[j + 1]?.ok && days[j + 1]!.date === addDays(days[j]!.date, 1)) j++;
    best = { from: days[i]!.date, to: days[j]!.date };
  }
  return { soil: soilTop, days, best };
}
