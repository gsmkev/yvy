/**
 * Recorrida GPS (F-05): acumula fixes, descarta los malos y arma el registro `track`.
 * Lógica pura y sin sensores: la pantalla (walk.ts) le pasa los fixes. Así se prueba sin celular.
 */
import { trackLengthM, simplifyToMax, type LonLat } from "@yvy/geo";
import { LIMITS, type TrackData } from "@yvy/shared";
import { distanceM } from "./bearing";

export interface WalkFix {
  lon: number;
  lat: number;
  accuracy: number | null;
  at: number;
}

export interface WalkDraft {
  startedAt: number;
  points: LonLat[];
  /** Distancia acumulada de la línea cruda, en metros. */
  distanceM: number;
  /** Instante del último punto aceptado (para el tiempo cuando se corta). */
  lastAt: number;
}

export const newDraft = (startedAt: number): WalkDraft => ({ startedAt, points: [], distanceM: 0, lastAt: startedAt });

/**
 * Suma un fix si sirve: precisión conocida y razonable, y movimiento real (el GPS parado "tiembla" unos metros;
 * contarlo inflaría la distancia). Devuelve el mismo draft si lo descarta.
 */
export function addFix(d: WalkDraft, fix: WalkFix): WalkDraft {
  if (fix.accuracy !== null && fix.accuracy > LIMITS.track.maxAccuracyM) return d;
  const last = d.points[d.points.length - 1];
  if (!last) return { ...d, points: [[fix.lon, fix.lat]], lastAt: fix.at };
  const step = distanceM({ lon: last[0], lat: last[1] }, fix);
  // Con mala precisión el paso mínimo crece: no contamos como camino lo que es ruido del GPS.
  const min = Math.max(LIMITS.track.minStepM, (fix.accuracy ?? 0) / 2);
  if (step < min) return { ...d, lastAt: fix.at };
  return { ...d, points: [...d.points, [fix.lon, fix.lat]], distanceM: d.distanceM + step, lastAt: fix.at };
}

export const durationS = (d: WalkDraft, now: number): number => Math.max(0, Math.round((now - d.startedAt) / 1000));

/** ¿Hay recorrida que guardar? Menos de 2 puntos o menos de 20 m no prueba nada. */
export const isTooShort = (d: WalkDraft): boolean => d.points.length < 2 || d.distanceM < 20;

/** Registro `track` listo para guardar: línea simplificada (Douglas-Peucker), distancia y tiempo reales. */
export function buildTrack(d: WalkDraft, endedAt: number): TrackData {
  const line = simplifyToMax(d.points, LIMITS.track.maxPoints, LIMITS.track.simplifyToleranceM);
  return {
    line,
    // Se mide con la línea cruda: simplificar recorta esquinas y daría menos de lo caminado.
    distanceM: Math.round(d.distanceM || trackLengthM(line)),
    durationS: Math.min(LIMITS.track.maxDurationS, durationS(d, endedAt)),
    startedAt: d.startedAt,
    endedAt: Math.max(d.startedAt, endedAt),
  };
}

export const serializeDraft = (d: WalkDraft): string => JSON.stringify(d);

export function parseDraft(raw: string | null): WalkDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as WalkDraft;
    return typeof d.startedAt === "number" && Array.isArray(d.points) && typeof d.distanceM === "number" ? d : null;
  } catch {
    return null;
  }
}

/** "1,2 km" o "350 m"; "47 min" o "1 h 05". */
export function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  if (m < 60) return `${Math.max(0, m)} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}
