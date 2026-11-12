/** Ficha del lote (F-23): cálculos puros sobre lo que ya está en el celular. */
import { LIMITS } from "@yvy/shared";

export interface VigorPassLite {
  mean: number;
  acquiredAt: number;
}

export type VigorTrend = { kind: "none" } | { kind: "up" | "down" | "flat"; pct: number };

/**
 * Cómo cambió el vigor entre las dos últimas pasadas. "down" solo cuando la caída pasa el umbral compartido con la web
 * (LIMITS.vigor.dropThresholdPct); un cambio menor se lee como "flat".
 */
export function vigorTrend(last: VigorPassLite | null, previous: VigorPassLite | null): VigorTrend {
  if (!last || !previous || previous.mean <= 0) return { kind: "none" };
  const pct = ((last.mean - previous.mean) / previous.mean) * 100;
  if (pct <= -LIMITS.vigor.dropThresholdPct) return { kind: "down", pct: Math.abs(pct) };
  if (pct >= LIMITS.vigor.dropThresholdPct) return { kind: "up", pct };
  return { kind: "flat", pct: Math.abs(pct) };
}

/** Días enteros desde `ms` hasta `now`; 0 si es hoy. */
export const daysSince = (ms: number, now = Date.now()): number => Math.max(0, Math.floor((now - ms) / 86_400_000));
