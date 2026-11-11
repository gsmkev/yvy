/**
 * Reglas de avisos (PRD RF-70, ajustadas al anexo Cloudflare §4.8). Funciones puras: se prueban sin red.
 * La probabilidad es cualitativa (baja/media/alta) y siempre orientativa (RF-74).
 */
import { addDays, DEFAULT_ALERT_SETTINGS } from "@yvy/shared";
import type { DailyForecast } from "./weather";

export const RULES = {
  frost: { tminC: DEFAULT_ALERT_SETTINGS.frostTminC, severeTminC: 0, horizonDays: 5 },
  excessRain: { mm72h: 80, mm7d: 150 },
  drought: { rainRatio: 1 - DEFAULT_ALERT_SETTINGS.droughtDeficitPct / 100, soilPercentile: "p20", noRainMm: 20 },
  sensitiveCrops: ["trigo", "maiz", "girasol"] as const,
} as const;

export type Severity = "info" | "watch" | "warning";
export type Probability = "low" | "medium" | "high";

export interface AlertDraft {
  kind: "frost" | "excess_rain" | "drought" | "fire";
  severity: Severity;
  probability: Probability | null;
  validFrom: string;
  validTo: string;
  summary: string;
  details: Record<string, unknown>;
}

/**
 * Helada: Tmin ≤ 2 °C en algún día de los próximos 5. Probabilidad por consistencia entre las últimas
 * corridas (la más nueva primero) y por el margen bajo el umbral.
 */
export function evaluateFrost(
  runs: DailyForecast[][],
  today: string,
  tminC: number = RULES.frost.tminC,
): AlertDraft | null {
  const latest = runs[0];
  if (!latest) return null;
  const horizon = addDays(today, RULES.frost.horizonDays);
  const cold = latest.filter(
    (d) => d.date >= today && d.date <= horizon && d.tminC !== null && d.tminC <= tminC,
  );
  if (!cold.length) return null;
  const minT = Math.min(...cold.map((d) => d.tminC!));
  const confirming = runs.filter((run) =>
    run.some((d) => cold.some((c) => c.date === d.date) && d.tminC !== null && d.tminC <= tminC),
  ).length;
  let score = confirming >= 3 ? 2 : confirming === 2 ? 1 : 0;
  if (minT <= RULES.frost.severeTminC) score++;
  const probability: Probability = score >= 2 ? "high" : score === 1 ? "medium" : "low";
  return {
    kind: "frost",
    severity: minT <= RULES.frost.severeTminC ? "warning" : "watch",
    probability,
    validFrom: cold[0]!.date,
    validTo: cold[cold.length - 1]!.date,
    summary: `Posible helada: mínima de ${minT.toFixed(1).replace(".", ",")} °C`,
    details: {
      days: cold.map((d) => ({ date: d.date, tminC: d.tminC })),
      runsConfirming: confirming,
      runsTotal: runs.length,
    },
  };
}

/** Exceso de lluvia: ≥ umbral en 24 h (configurable, 50 mm por defecto), ≥ 80 mm en 72 h o ≥ 150 mm en 7 días. */
export function evaluateExcessRain(
  forecast: DailyForecast[],
  today: string,
  mm24h: number = DEFAULT_ALERT_SETTINGS.excessRainMm24h,
): AlertDraft | null {
  const days = forecast.filter((d) => d.date >= today);
  let best: { from: string; to: string; mm: number; window: "24h" | "72h" | "7d" } | null = null;
  for (let i = 0; i < days.length; i++) {
    const d1 = days[i]!;
    if (d1.precipMm >= mm24h && (!best || d1.precipMm > best.mm))
      best = { from: d1.date, to: d1.date, mm: d1.precipMm, window: "24h" };
    const w3 = days.slice(i, i + 3);
    const mm3 = w3.reduce((a, d) => a + d.precipMm, 0);
    if (mm3 >= RULES.excessRain.mm72h && (!best || mm3 > best.mm))
      best = { from: w3[0]!.date, to: w3[w3.length - 1]!.date, mm: mm3, window: "72h" };
    const w7 = days.slice(i, i + 7);
    const mm7 = w7.reduce((a, d) => a + d.precipMm, 0);
    if (w7.length === 7 && mm7 >= RULES.excessRain.mm7d && !best)
      best = { from: w7[0]!.date, to: w7[6]!.date, mm: mm7, window: "7d" };
  }
  if (!best) return null;
  return {
    kind: "excess_rain",
    severity: best.mm >= (best.window === "24h" ? mm24h : RULES.excessRain.mm72h) * 1.5 ? "warning" : "watch",
    probability: "medium",
    validFrom: best.from,
    validTo: best.to,
    summary: `Exceso de lluvia: ${Math.round(best.mm)} mm pronosticados (${best.window === "7d" ? "7 días" : best.window === "72h" ? "72 h" : "24 h"})`,
    details: { mm: Math.round(best.mm), window: best.window },
  };
}

/**
 * Sequía: lluvia de 30 días < 50 % de lo normal Y humedad del suelo bajo el percentil 20, sin lluvia
 * significativa (> 20 mm) en el pronóstico disponible (9 días con MET Norway).
 */
export function evaluateDrought(
  x: {
    today: string;
    rain30: number | null;
    normal30: number | null;
    soilNow: number | null;
    soilP20: number | null;
    forecast: DailyForecast[];
  },
  deficitPct: number = DEFAULT_ALERT_SETTINGS.droughtDeficitPct,
): AlertDraft | null {
  if (x.rain30 === null || !x.normal30 || x.soilNow === null || x.soilP20 === null) return null;
  const ratio = x.rain30 / x.normal30;
  const maxForecast = Math.max(0, ...x.forecast.map((d) => d.precipMm));
  if (ratio >= 1 - deficitPct / 100 || x.soilNow >= x.soilP20 || maxForecast > RULES.drought.noRainMm) return null;
  return {
    kind: "drought",
    severity: ratio < 0.25 ? "warning" : "watch",
    probability: null,
    validFrom: x.today,
    validTo: addDays(x.today, 15),
    summary: `Sequía: ${Math.round(ratio * 100)} % de la lluvia normal en 30 días y suelo seco`,
    details: { rain30: x.rain30, normal30: x.normal30, soilNow: x.soilNow, soilP20: x.soilP20 },
  };
}

/** Lotes afectados: para helada, primero los cultivos sensibles (RF-71). */
export function affectedPlots(
  kind: AlertDraft["kind"],
  plots: { id: string; kind: string; crop: string | null }[],
): string[] {
  if (kind !== "frost") return plots.map((p) => p.id);
  const sensitive = (p: { crop: string | null }) => (RULES.sensitiveCrops as readonly string[]).includes(p.crop ?? "");
  return [
    ...plots.filter((p) => p.kind === "crop" && sensitive(p)),
    ...plots.filter((p) => p.kind === "crop" && !sensitive(p)),
    ...plots.filter((p) => p.kind !== "crop"),
  ].map((p) => p.id);
}

export const severityRank = (s: Severity) => ({ info: 0, watch: 1, warning: 2 })[s];
