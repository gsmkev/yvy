/**
 * Aviso de roya asiática de la soja (A-40). La infección necesita hojas mojadas varias horas seguidas con
 * temperatura templada. No hay sensor de mojado foliar: se estima con el pronóstico horario de MET Norway
 * (humedad relativa >= LIMITS.rust.humidityPct o lluvia en la hora) con la temperatura dentro del rango de la roya.
 * Solo avisa si la estancia tiene lotes de soja. Valores de referencia en LIMITS.rust, a revisar por un agrónomo.
 */
import { LIMITS, localDate } from "@yvy/shared";
import type { HourlyForecast } from "./weather";
import type { AlertDraft } from "./rules";

export interface RustDay {
  date: string;
  /** Horas del día local con mojado estimado y temperatura favorable. */
  wetHours: number;
}

/** Horas favorables por día local. */
export function wetHoursByDay(hours: HourlyForecast[], tz: string): RustDay[] {
  const L = LIMITS.rust;
  const days = new Map<string, number>();
  for (const h of hours) {
    const date = localDate(h.validAt, tz);
    const wet = h.humidityPct >= L.humidityPct || h.precipMm >= L.rainMm;
    const warm = h.tempC >= L.tempMinC && h.tempC <= L.tempMaxC;
    days.set(date, (days.get(date) ?? 0) + (wet && warm ? 1 : 0));
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, wetHours]) => ({ date, wetHours }));
}

export function evaluateRust(hours: HourlyForecast[], tz: string, soyPlotIds: string[]): AlertDraft | null {
  if (!soyPlotIds.length) return null;
  const L = LIMITS.rust;
  const days = wetHoursByDay(hours, tz);
  const hot = days.filter((d) => d.wetHours >= L.watchHours);
  if (!hot.length) return null;
  const peak = hot.reduce((a, b) => (b.wetHours > a.wetHours ? b : a));
  const consecutive = hot.some((d, i) => i > 0 && Date.parse(d.date) - Date.parse(hot[i - 1]!.date) === 86_400_000);
  const severe = peak.wetHours >= L.warningHours || consecutive;
  return {
    kind: "rust_risk",
    severity: severe ? "warning" : "watch",
    probability: null,
    validFrom: hot[0]!.date,
    validTo: hot[hot.length - 1]!.date,
    summary: `Riesgo de roya asiática en soja: hasta ${peak.wetHours} horas de hoja mojada con ${L.tempMinC} a ${L.tempMaxC} °C el ${peak.date}`,
    details: {
      plotIds: soyPlotIds,
      wetHoursByDay: days,
      thresholds: { watchHours: L.watchHours, warningHours: L.warningHours },
      estimated: true,
    },
  };
}
