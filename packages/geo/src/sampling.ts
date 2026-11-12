/** Puntos y trazas sobre lotes: etiqueta garantizada adentro (M-12), grilla de muestreo (M-18) y perímetro caminado (M-04). */
import pointOnFeature from "@turf/point-on-feature";
import type { Polygon, Position } from "geojson";
import { areaHa, containsPoint, validatePolygon, type Area, type ValidationError } from "./index";

/** Punto garantizado dentro del polígono (el centroide o el centro del bbox caen afuera en lotes en L o en U). */
export function labelPoint(g: Area): { lon: number; lat: number } {
  const [lon, lat] = pointOnFeature({ type: "Feature", properties: {}, geometry: g }).geometry.coordinates as [number, number];
  return { lon, lat };
}

const M_PER_DEG_LAT = 111_320;

export interface SamplePoint {
  /** Número del punto, desde 1, recorriendo la grilla en zigzag para caminarla sin saltos. */
  n: number;
  lon: number;
  lat: number;
}

export const SAMPLING_HA = [5, 10] as const;

/**
 * Grilla regular de muestreo de suelo: un punto cada `haPerPoint` hectáreas (celdas cuadradas de lado
 * sqrt(ha × 10.000) m, punto en el centro de cada celda), solo los que caen dentro del lote.
 * Se recorre en filas de oeste a este y de este a oeste alternadas. Un lote más chico que una celda lleva un punto
 * en su punto interior. Trabaja en metros locales (equirectangular): sobra para lotes de hasta unos km.
 */
export function samplingGrid(g: Area, haPerPoint: number): SamplePoint[] {
  if (!(haPerPoint > 0)) throw new Error("haPerPoint inválido");
  const ring = (g.type === "Polygon" ? g.coordinates[0] : g.coordinates.flatMap((p) => p[0]!)) as Position[];
  const lons = ring.map((p) => p[0]!);
  const lats = ring.map((p) => p[1]!);
  const [minLon, maxLon, minLat, maxLat] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const lat0 = (minLat + maxLat) / 2;
  const mLon = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const side = Math.sqrt(haPerPoint * 10_000);
  const dLon = side / mLon;
  const dLat = side / M_PER_DEG_LAT;
  const rows: { lon: number; lat: number }[][] = [];
  for (let lat = minLat + dLat / 2; lat < maxLat; lat += dLat) {
    const row: { lon: number; lat: number }[] = [];
    for (let lon = minLon + dLon / 2; lon < maxLon; lon += dLon) if (containsPoint(g, lon, lat)) row.push({ lon, lat });
    rows.push(row);
  }
  const ordered = rows.flatMap((r, i) => (i % 2 ? r.slice().reverse() : r)).reverse(); // de norte a sur
  const pts = ordered.length ? ordered : [labelPoint(g)];
  return pts.map((p, i) => ({ n: i + 1, lon: round(p.lon), lat: round(p.lat) }));
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Cuántos puntos lleva un lote con esa densidad (sin generar la grilla completa). */
export const samplingCount = (g: Area, haPerPoint: number): number => Math.max(1, Math.round(areaHa(g) / haPerPoint));

// ---------- Perímetro caminado (M-04) ----------

export interface TracePoint {
  lon: number;
  lat: number;
  /** Error horizontal informado por el GPS, en metros (null si no informó). */
  accuracy?: number | null;
}

const distM = (a: TracePoint, b: TracePoint): number => {
  const mLon = M_PER_DEG_LAT * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot((a.lon - b.lon) * mLon, (a.lat - b.lat) * M_PER_DEG_LAT);
};

/** Descarta fijos pobres y los que están a menos de `minStepM` del último guardado (quieto o ruido). */
export function filterFix(last: TracePoint | undefined, fix: TracePoint, opts: { maxAccuracyM?: number; minStepM?: number } = {}): boolean {
  const { maxAccuracyM = 25, minStepM = 4 } = opts;
  if (typeof fix.accuracy === "number" && fix.accuracy > maxAccuracyM) return false;
  return !last || distM(last, fix) >= minStepM;
}

/** Douglas-Peucker sobre metros locales; deja las esquinas del recorrido y quita los puntos de en medio. */
export function simplifyTrace(points: TracePoint[], toleranceM = 3): TracePoint[] {
  if (points.length < 3) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1;
    let farD = toleranceM;
    for (let i = a + 1; i < b; i++) {
      const d = distToSegmentM(points[i]!, points[a]!, points[b]!);
      if (d > farD) {
        far = i;
        farD = d;
      }
    }
    if (far >= 0) {
      keep[far] = true;
      stack.push([a, far], [far, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function distToSegmentM(p: TracePoint, a: TracePoint, b: TracePoint): number {
  const mLon = M_PER_DEG_LAT * Math.cos((p.lat * Math.PI) / 180);
  const px = (p.lon - a.lon) * mLon;
  const py = (p.lat - a.lat) * M_PER_DEG_LAT;
  const bx = (b.lon - a.lon) * mLon;
  const by = (b.lat - a.lat) * M_PER_DEG_LAT;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
}

export type TraceError = ValidationError | "too_few_points";

/**
 * Cierra el recorrido caminado y lo convierte en un polígono: simplifica, cierra el anillo y valida
 * (autointersecciones incluidas, validación completa del cliente).
 */
export function traceToPolygon(points: TracePoint[], toleranceM = 3): { polygon: Polygon; ha: number } | { error: TraceError } {
  const simple = simplifyTrace(points, toleranceM);
  // Al cerrar, el último punto queda en el lado que une el penúltimo con el primero: sobra
  while (simple.length > 3 && distToSegmentM(simple[simple.length - 1]!, simple[simple.length - 2]!, simple[0]!) <= toleranceM) simple.pop();
  if (simple.length < 3) return { error: "too_few_points" };
  const ring: Position[] = simple.map((p) => [round(p.lon), round(p.lat)]);
  ring.push([...ring[0]!]);
  const polygon: Polygon = { type: "Polygon", coordinates: [ring] };
  const err = validatePolygon(polygon);
  if (err) return { error: err };
  return { polygon, ha: areaHa(polygon) };
}
