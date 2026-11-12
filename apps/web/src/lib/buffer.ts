/**
 * Zonas de amortiguación (A-15): qué casas, escuelas y cursos de agua quedan cerca de cada lote y qué aplicaciones
 * cayeron dentro de la distancia. Se calcula en el navegador con packages/geo (el Worker no hace geometría).
 */
import { lineToAreaM, pointToAreaM, pointToLineM, type Area } from "@yvy/geo";
import { LIMITS } from "@yvy/shared";
import type { LineString } from "geojson";

export type BufferKind = "house" | "school" | "water" | "stream";
export const BUFFER_KINDS: readonly BufferKind[] = ["house", "school", "water", "stream"];
export type BufferDistances = Record<BufferKind, number>;

export const DEFAULT_DISTANCES: BufferDistances = {
  house: LIMITS.buffer.house,
  school: LIMITS.buffer.school,
  water: LIMITS.buffer.water,
  stream: LIMITS.buffer.stream,
};

/** Distancias válidas: números entre 0 y el tope; lo que no sirve vuelve al valor de referencia. */
export function cleanDistances(raw: Partial<Record<BufferKind, unknown>> | null | undefined): BufferDistances {
  const out = { ...DEFAULT_DISTANCES };
  for (const k of BUFFER_KINDS) {
    const n = Number(raw?.[k]);
    if (raw?.[k] !== "" && raw?.[k] != null && Number.isFinite(n) && n >= 0 && n <= LIMITS.buffer.maxM) out[k] = Math.round(n);
  }
  return out;
}

export interface BufferHit {
  kind: BufferKind;
  name: string;
  distanceM: number;
  limitM: number;
}

export interface BufferFeatures {
  /** Casas, escuelas y aguadas (puntos de interés). */
  points: { kind: string; name: string; lon: number; lat: number }[];
  /** Líneas de tipo curso de agua. */
  streams: { name: string; geometry: LineString }[];
}

const isBufferKind = (k: string): k is BufferKind => k === "house" || k === "school" || k === "water";

/** Elementos sensibles dentro de su distancia respecto de un punto o un polígono, del más cerca al más lejos. */
export function hitsFor(
  target: { area: Area } | { lon: number; lat: number },
  features: BufferFeatures,
  limits: BufferDistances,
): BufferHit[] {
  const out: BufferHit[] = [];
  for (const p of features.points) {
    if (!isBufferKind(p.kind)) continue;
    const d = "area" in target ? pointToAreaM(p.lon, p.lat, target.area) : pointToPointM(target, p);
    if (d <= limits[p.kind]) out.push({ kind: p.kind, name: p.name, distanceM: Math.round(d), limitM: limits[p.kind] });
  }
  for (const s of features.streams) {
    const d = "area" in target ? lineToAreaM(s.geometry, target.area) : pointToLineM(target.lon, target.lat, s.geometry);
    if (d <= limits.stream) out.push({ kind: "stream", name: s.name, distanceM: Math.round(d), limitM: limits.stream });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}

const R = 6_371_008.8;
function pointToPointM(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const rad = Math.PI / 180;
  const k = Math.cos(((a.lat + b.lat) / 2) * rad);
  return Math.hypot((b.lon - a.lon) * rad * R * k, (b.lat - a.lat) * rad * R);
}

export interface BufferApplication {
  id: string;
  plotId: string | null;
  plotName: string | null;
  capturedAt: number;
  lon: number | null;
  lat: number | null;
  gpsAccuracyM: number | null;
}

export interface BufferAlert {
  recordId: string;
  plotId: string | null;
  plotName: string | null;
  capturedAt: number;
  /** gps: el punto de la aplicación cae dentro; plot: sin GPS, el lote entero toca la zona. */
  basis: "gps" | "plot";
  hits: BufferHit[];
}

export interface BufferAnalysis {
  plots: { plotId: string; hits: BufferHit[] }[];
  alerts: BufferAlert[];
}

/** Lotes con algo sensible cerca y aplicaciones que cayeron dentro de la distancia. */
export function bufferAnalysis(
  plots: { id: string; name: string; geometry: string }[],
  features: BufferFeatures,
  applications: BufferApplication[],
  limits: BufferDistances,
): BufferAnalysis {
  const areaOf = new Map<string, Area>();
  const hitsByPlot = new Map<string, BufferHit[]>();
  for (const p of plots) {
    const area = JSON.parse(p.geometry) as Area;
    areaOf.set(p.id, area);
    const hits = hitsFor({ area }, features, limits);
    if (hits.length) hitsByPlot.set(p.id, hits);
  }
  const alerts: BufferAlert[] = [];
  for (const a of applications) {
    if (a.lon !== null && a.lat !== null) {
      const hits = hitsFor({ lon: a.lon, lat: a.lat }, features, limits);
      if (hits.length) alerts.push({ recordId: a.id, plotId: a.plotId, plotName: a.plotName, capturedAt: a.capturedAt, basis: "gps", hits });
    } else if (a.plotId && hitsByPlot.has(a.plotId)) {
      alerts.push({ recordId: a.id, plotId: a.plotId, plotName: a.plotName, capturedAt: a.capturedAt, basis: "plot", hits: hitsByPlot.get(a.plotId)! });
    }
  }
  return {
    plots: [...hitsByPlot.entries()].map(([plotId, hits]) => ({ plotId, hits })),
    alerts: alerts.sort((x, y) => y.capturedAt - x.capturedAt),
  };
}
