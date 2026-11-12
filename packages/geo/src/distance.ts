/**
 * Distancias en metros entre puntos, líneas y polígonos (A-15, zonas de amortiguación).
 * Proyección local equirrectangular alrededor del punto de referencia: el error es de centímetros a escala de
 * estancia (decenas de kilómetros), de sobra para comparar con distancias de 50 a 500 m.
 */
import type { LineString, Polygon, Position } from "geojson";
import { containsPoint, type Area } from "./index";

const R = 6_371_008.8;
const RAD = Math.PI / 180;

type XY = [number, number];

/** Proyecta a metros (x este, y norte) respecto de un origen. */
const project = (origin: { lon: number; lat: number }) => {
  const k = Math.cos(origin.lat * RAD);
  return (p: Position): XY => [(p[0]! - origin.lon) * RAD * R * k, (p[1]! - origin.lat) * RAD * R];
};

function pointSegment(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const cross = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function segmentsIntersect(a: XY, b: XY, c: XY, d: XY): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

const rings = (g: Area): Position[][] =>
  g.type === "Polygon" ? (g as Polygon).coordinates : g.coordinates.flat();

/** Distancia (m) de un punto al borde de un polígono; 0 si está adentro. */
export function pointToAreaM(lon: number, lat: number, g: Area): number {
  if (containsPoint(g, lon, lat)) return 0;
  const to = project({ lon, lat });
  let best = Infinity;
  for (const ring of rings(g)) {
    const pts = ring.map(to);
    for (let i = 0; i + 1 < pts.length; i++) best = Math.min(best, pointSegment([0, 0], pts[i]!, pts[i + 1]!));
  }
  return best;
}

/** Distancia (m) de un punto a una línea. */
export function pointToLineM(lon: number, lat: number, g: LineString): number {
  const to = project({ lon, lat });
  const pts = g.coordinates.map(to);
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) best = Math.min(best, pointSegment([0, 0], pts[i]!, pts[i + 1]!));
  return pts.length === 1 ? Math.hypot(pts[0]![0], pts[0]![1]) : best;
}

/** Distancia (m) mínima entre una línea y un polígono; 0 si se cruzan o la línea entra al polígono. */
export function lineToAreaM(line: LineString, g: Area): number {
  const first = line.coordinates[0];
  if (!first || !line.coordinates.length) return Infinity;
  const to = project({ lon: first[0]!, lat: first[1]! });
  const lp = line.coordinates.map(to);
  let best = Infinity;
  for (const ring of rings(g)) {
    const rp = ring.map(to);
    for (let i = 0; i + 1 < rp.length; i++) {
      for (let j = 0; j + 1 < lp.length; j++) {
        if (segmentsIntersect(rp[i]!, rp[i + 1]!, lp[j]!, lp[j + 1]!)) return 0;
      }
      // vértices de la línea contra la arista, y vértices del anillo contra la línea
      for (const p of lp) best = Math.min(best, pointSegment(p, rp[i]!, rp[i + 1]!));
    }
    for (const p of rp) for (let j = 0; j + 1 < lp.length; j++) best = Math.min(best, pointSegment(p, lp[j]!, lp[j + 1]!));
  }
  // una línea entera dentro del polígono no cruza el borde pero está adentro
  if (best > 0 && containsPoint(g, first[0]!, first[1]!)) return 0;
  return best;
}
