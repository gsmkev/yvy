import { NDVI_RAMP } from "@yvy/shared";
import type { Plot } from "./types";

/** Rango de NDVI que cubre la rampa: por debajo del primero es suelo o cultivo en problemas. */
const LOW = 0.2;
const HIGH = 0.9;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Color de la rampa NDVI (interpolado entre las cinco paradas) para un valor de NDVI. */
export function ndviColor(v: number): string {
  const pos = Math.min(1, Math.max(0, (v - LOW) / (HIGH - LOW))) * (NDVI_RAMP.length - 1);
  const i = Math.min(NDVI_RAMP.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = rgb(NDVI_RAMP[i]!);
  const b = rgb(NDVI_RAMP[i + 1]!);
  const c = a.map((x, k) => Math.round(x + (b[k]! - x) * f));
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** Caída de vigor que se avisa: más de 15 % entre las dos últimas pasadas. */
export const DROP_THRESHOLD_PCT = 15;

export interface VigorDrop {
  /** Caída redondeada, en %. */
  pct: number;
  /** Fecha de la pasada anterior (epoch ms). */
  since: number;
}

/** Caída entre las dos últimas pasadas NDVI del lote, o null si no supera el umbral. */
export function vigorDrop(p: Pick<Plot, "ndviMean" | "ndviPrevMean" | "ndviPrevAt">): VigorDrop | null {
  const { ndviMean: cur, ndviPrevMean: prev, ndviPrevAt: since } = p;
  if (cur === null || prev === null || since === null || prev <= 0) return null;
  const pct = ((prev - cur) / prev) * 100;
  return pct > DROP_THRESHOLD_PCT ? { pct: Math.round(pct), since } : null;
}
