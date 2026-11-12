/**
 * Estrés térmico del ganado (backlog G-32). Funciones puras compartidas por el Worker y la web.
 *
 * Índice de temperatura y humedad (THI) de Mader et al. (2006) con temperatura en °C y humedad relativa en %:
 *   THI = 0,8 · T + (HR / 100) · (T − 14,4) + 46,4
 * Umbrales de la categoría de peligro del Livestock Conservation Institute (LCI), la referencia más usada para
 * bovinos. VALORES POR DEFECTO A REVISAR POR UN TÉCNICO: varían con la raza (las cebuinas toleran más que las
 * británicas), el pelaje, la sombra y la aclimatación; no son una recomendación para un rodeo en particular.
 */

export const HEAT_LEVELS = ["normal", "alert", "danger", "emergency"] as const;
export type HeatLevel = (typeof HEAT_LEVELS)[number];

/** Límite inferior (THI) de cada nivel. Debajo de `alert` el ganado no está en estrés. */
export const HEAT_THRESHOLDS = { alert: 75, danger: 79, emergency: 84 } as const;

/** Reglas del aviso `heat_stress`: horas del pronóstico (ventana de `windowHours`) en cada nivel. */
export const HEAT_ALERT = {
  windowHours: 48,
  /** "Atención" (watch): al menos estas horas en peligro (THI >= 79). */
  dangerHours: 3,
  /** "Advertencia" (warning): al menos estas horas en emergencia (THI >= 84). */
  emergencyHours: 2,
} as const;

export const thi = (tempC: number, humidityPct: number): number =>
  0.8 * tempC + (humidityPct / 100) * (tempC - 14.4) + 46.4;

export function heatLevel(value: number): HeatLevel {
  if (value >= HEAT_THRESHOLDS.emergency) return "emergency";
  if (value >= HEAT_THRESHOLDS.danger) return "danger";
  if (value >= HEAT_THRESHOLDS.alert) return "alert";
  return "normal";
}

export interface HeatHour {
  at: number;
  tempC: number;
  humidityPct: number;
  thi: number;
  level: HeatLevel;
}

/** THI de cada hora del pronóstico; descarta las que no tienen temperatura o humedad. */
export function heatHours(
  hours: readonly { validAt: number; tempC: number | null; humidityPct: number | null }[],
): HeatHour[] {
  const out: HeatHour[] = [];
  for (const h of hours) {
    if (h.tempC === null || h.humidityPct === null) continue;
    const v = Math.round(thi(h.tempC, h.humidityPct) * 10) / 10;
    out.push({ at: h.validAt, tempC: h.tempC, humidityPct: h.humidityPct, thi: v, level: heatLevel(v) });
  }
  return out;
}

export interface HeatSummary {
  maxThi: number | null;
  maxLevel: HeatLevel;
  /** Horas de la ventana en peligro o emergencia, y solo en emergencia. */
  dangerHours: number;
  emergencyHours: number;
  /** Primera hora en peligro, o null. */
  firstDangerAt: number | null;
}

/** Resumen de las próximas `windowHours` horas desde `from`. */
export function summarizeHeat(
  hours: readonly HeatHour[],
  from: number,
  windowHours: number = HEAT_ALERT.windowHours,
): HeatSummary {
  const until = from + windowHours * 3_600_000;
  const win = hours.filter((h) => h.at >= from && h.at < until);
  const danger = win.filter((h) => h.thi >= HEAT_THRESHOLDS.danger);
  const max = win.reduce<number | null>((m, h) => (m === null || h.thi > m ? h.thi : m), null);
  return {
    maxThi: max,
    maxLevel: max === null ? "normal" : heatLevel(max),
    dangerHours: danger.length,
    emergencyHours: win.filter((h) => h.thi >= HEAT_THRESHOLDS.emergency).length,
    firstDangerAt: danger[0]?.at ?? null,
  };
}

/** Severidad del aviso según el resumen, o null si no corresponde avisar. */
export function heatAlertSeverity(sum: HeatSummary): "watch" | "warning" | null {
  if (sum.emergencyHours >= HEAT_ALERT.emergencyHours) return "warning";
  if (sum.dangerHours >= HEAT_ALERT.dangerHours) return "watch";
  return null;
}

/** Respuesta de GET /org/farms/:id/heat-stress. */
export interface FarmHeatStressResponse {
  hours: HeatHour[];
  summary: HeatSummary;
  thresholds: typeof HEAT_THRESHOLDS;
  windowHours: number;
}
