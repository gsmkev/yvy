/**
 * Aviso de estrés térmico del ganado (G-32): THI calculado con la temperatura y la humedad horarias de MET Norway.
 * Función pura: se prueba sin red. Los umbrales y reglas están en packages/shared/src/heat.ts (valores por defecto).
 */
import { heatAlertSeverity, heatHours, HEAT_ALERT, HEAT_THRESHOLDS, localDate, summarizeHeat } from "@yvy/shared";
import type { AlertDraft } from "./rules";

export function evaluateHeatStress(
  hours: readonly { validAt: number; tempC: number | null; humidityPct: number | null }[],
  now: number,
  tz: string,
): AlertDraft | null {
  const hh = heatHours(hours);
  const from = now - (now % 3_600_000);
  const sum = summarizeHeat(hh, from, HEAT_ALERT.windowHours);
  const severity = heatAlertSeverity(sum);
  if (!severity || sum.maxThi === null) return null;
  const until = from + HEAT_ALERT.windowHours * 3_600_000;
  const danger = hh.filter((h) => h.at >= from && h.at < until && h.thi >= HEAT_THRESHOLDS.danger);
  const first = danger[0]!;
  const last = danger[danger.length - 1]!;
  return {
    kind: "heat_stress",
    severity,
    probability: null,
    validFrom: localDate(first.at, tz),
    validTo: localDate(last.at, tz),
    summary: `Calor intenso para el ganado: THI de hasta ${Math.round(sum.maxThi)} (${
      sum.maxLevel === "emergency" ? "emergencia" : "peligro"
    })`,
    details: {
      maxThi: sum.maxThi,
      dangerHours: sum.dangerHours,
      emergencyHours: sum.emergencyHours,
      firstDangerAt: sum.firstDangerAt,
    },
  };
}
