/** Umbrales de avisos configurables por estancia (backlog C-04). Valores por defecto = reglas del servidor. */
import { z } from "zod";

export const DEFAULT_ALERT_SETTINGS = {
  /** Helada: mínima pronosticada igual o menor a este valor (°C). */
  frostTminC: 2,
  /** Exceso de lluvia: acumulado pronosticado en 24 h igual o mayor a este valor (mm). */
  excessRainMm24h: 50,
  /** Sequía: déficit de lluvia de 30 días respecto de lo normal, en %. 50 = menos de la mitad de lo normal. */
  droughtDeficitPct: 50,
} as const;

export const ALERT_SETTINGS_LIMITS = {
  frostTminC: { min: -5, max: 8 },
  excessRainMm24h: { min: 10, max: 300 },
  droughtDeficitPct: { min: 10, max: 90 },
} as const;

export const alertSettingsSchema = z.object({
  frostTminC: z.number().min(ALERT_SETTINGS_LIMITS.frostTminC.min).max(ALERT_SETTINGS_LIMITS.frostTminC.max),
  excessRainMm24h: z
    .number()
    .min(ALERT_SETTINGS_LIMITS.excessRainMm24h.min)
    .max(ALERT_SETTINGS_LIMITS.excessRainMm24h.max),
  droughtDeficitPct: z
    .number()
    .min(ALERT_SETTINGS_LIMITS.droughtDeficitPct.min)
    .max(ALERT_SETTINGS_LIMITS.droughtDeficitPct.max),
});

export type AlertSettings = z.infer<typeof alertSettingsSchema>;
/**
 * Umbrales de plagas por defecto (backlog A-41). VALORES POR DEFECTO A REVISAR POR UN AGRÓNOMO:
 * son referencias generales de manejo integrado de plagas en soja, no una recomendación para un lote.
 */
export const PEST_THRESHOLDS: Record<
  string,
  { perMeter: number; crops: readonly string[]; stages: readonly string[] | null; label: string }
> = {
  /** Chinches: 2 por metro de surco en llenado de granos. */
  chinche: { perMeter: 2, crops: ["soja"], stages: ["floracion", "llenado"], label: "Chinche" },
  /** Orugas defoliadoras: 20 por metro de surco. */
  oruga: { perMeter: 20, crops: ["soja"], stages: null, label: "Oruga" },
};

/** Ventana de registros que se promedia para el aviso de plagas. */
export const PEST_WINDOW_DAYS = 7;
