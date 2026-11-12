/**
 * Edición de lotes (M-05): dividir un lote con una línea y unir dos lotes contiguos.
 * Lado cliente (web): el Worker solo recibe los polígonos ya resultantes.
 */
import turfLength from "@turf/length";
import turfUnion from "@turf/union";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { LineString, Polygon, Position } from "geojson";
import { areaHa, cleanArea, validatePolygon, type Area } from "./index";

export type SplitError =
  | "not_polygon"
  | "line_too_short"
  | "must_cross_twice"
  | "crosses_hole"
  | "degenerate";

export type MergeError = "not_adjacent" | "not_polygon" | "degenerate";

/** Largo de una línea en metros (geodésico). */
export const lineLengthM = (g: LineString): number => turfLength({ type: "Feature", properties: {}, geometry: g }, { units: "kilometers" }) * 1000;

interface Hit {
  /** Posición a lo largo de la línea de corte: índice de tramo + fracción. */
  pos: number;
  /** Arista del anillo (de ring[edge] a ring[edge + 1]) y fracción sobre ella. */
  edge: number;
  t: number;
  point: Position;
}

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/** Intersección de los tramos p->p2 y q->q2; u sobre el primero, t sobre el segundo. */
function segHit(p: Position, p2: Position, q: Position, q2: Position): { u: number; t: number } | null {
  const rx = p2[0]! - p[0]!;
  const ry = p2[1]! - p[1]!;
  const sx = q2[0]! - q[0]!;
  const sy = q2[1]! - q[1]!;
  const den = cross(rx, ry, sx, sy);
  if (Math.abs(den) < 1e-18) return null; // paralelos o alineados
  const qpx = q[0]! - p[0]!;
  const qpy = q[1]! - p[1]!;
  const u = cross(qpx, qpy, sx, sy) / den;
  const t = cross(qpx, qpy, rx, ry) / den;
  return u >= 0 && u <= 1 && t >= 0 && t < 1 ? { u, t } : null;
}

const signedArea = (ring: Position[]) => {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += ring[i]![0]! * ring[i + 1]![1]! - ring[i + 1]![0]! * ring[i]![1]!;
  return s / 2;
};
/** Anillo cerrado, antihorario (regla de la mano derecha de GeoJSON para el exterior). */
const closeCcw = (pts: Position[]): Position[] => {
  const ring = [...pts, pts[0]!];
  return signedArea(ring) < 0 ? ring.reverse() : ring;
};
const closeCw = (pts: Position[]): Position[] => {
  const ring = [...pts, pts[0]!];
  return signedArea(ring) > 0 ? ring.reverse() : ring;
};

const samePos = (a: Position, b: Position) => Math.abs(a[0]! - b[0]!) < 1e-12 && Math.abs(a[1]! - b[1]!) < 1e-12;

/** Vértices del anillo recorridos hacia adelante, desde el final de la arista `from` hasta el inicio de la arista `to`. */
function walk(ring: Position[], from: number, to: number): Position[] {
  const n = ring.length;
  const out: Position[] = [];
  let i = (from + 1) % n;
  out.push(ring[i]!);
  while (i !== to) {
    i = (i + 1) % n;
    out.push(ring[i]!);
  }
  return out;
}

/**
 * Divide un polígono con una línea. La línea tiene que cruzar el contorno exterior exactamente
 * dos veces (entra y sale); sus puntos intermedios pueden ser quiebres. Los huecos se reparten
 * entre las dos partes y la línea no puede atravesarlos.
 */
export function splitPolygon(
  poly: Polygon,
  line: LineString,
): { ok: true; parts: [Polygon, Polygon] } | { ok: false; error: SplitError } {
  if (poly.type !== "Polygon" || !poly.coordinates[0] || poly.coordinates[0].length < 4) return { ok: false, error: "not_polygon" };
  if (line.coordinates.length < 2) return { ok: false, error: "line_too_short" };
  const outer = poly.coordinates[0].slice(0, -1);
  const n = outer.length;
  const L = line.coordinates;

  const hits: Hit[] = [];
  for (let i = 0; i < L.length - 1; i++) {
    for (let k = 0; k < n; k++) {
      const a = outer[k]!;
      const b = outer[(k + 1) % n]!;
      const h = segHit(L[i]!, L[i + 1]!, a, b);
      if (!h) continue;
      hits.push({
        pos: i + h.u,
        edge: k,
        t: h.t,
        point: [a[0]! + (b[0]! - a[0]!) * h.t, a[1]! + (b[1]! - a[1]!) * h.t],
      });
    }
  }
  hits.sort((x, y) => x.pos - y.pos);
  if (hits.length !== 2) return { ok: false, error: "must_cross_twice" };
  const [h1, h2] = hits as [Hit, Hit];
  if (samePos(h1.point, h2.point)) return { ok: false, error: "degenerate" };

  // La línea no puede cortar un hueco
  for (const hole of poly.coordinates.slice(1)) {
    for (let i = 0; i < L.length - 1; i++) {
      for (let k = 0; k < hole.length - 1; k++) {
        if (segHit(L[i]!, L[i + 1]!, hole[k]!, hole[k + 1]!)) return { ok: false, error: "crosses_hole" };
      }
    }
  }

  const mid: Position[] = [];
  for (let j = Math.floor(h1.pos) + 1; j < h2.pos; j++) if (j > h1.pos) mid.push(L[j]!);

  const dedupe = (pts: Position[]) => pts.filter((p, i) => i === 0 || !samePos(p, pts[i - 1]!));
  // Parte A: contorno de h1 a h2, y de vuelta por la línea. Parte B: contorno de h2 a h1 y por la línea.
  const a = dedupe([h1.point, ...walk(outer, h1.edge, h2.edge), h2.point, ...[...mid].reverse()]);
  const b = dedupe([h2.point, ...walk(outer, h2.edge, h1.edge), h1.point, ...mid]);
  if (a.length < 3 || b.length < 3) return { ok: false, error: "degenerate" };

  const parts: [Polygon, Polygon] = [
    { type: "Polygon", coordinates: [closeCcw(a)] },
    { type: "Polygon", coordinates: [closeCcw(b)] },
  ];
  for (const hole of poly.coordinates.slice(1)) {
    const owner = booleanPointInPolygon(hole[0]!, parts[0]) ? parts[0] : parts[1];
    owner.coordinates.push(closeCw(hole.slice(0, -1)));
  }
  for (const p of parts) {
    if (validatePolygon(p) || areaHa(p) <= 0) return { ok: false, error: "degenerate" };
  }
  return { ok: true, parts };
}

/** Une dos lotes contiguos (comparten borde o se superponen). Si quedan separados, no_adjacent. */
export function mergePolygons(
  a: Polygon,
  b: Polygon,
): { ok: true; polygon: Polygon } | { ok: false; error: MergeError } {
  if (a.type !== "Polygon" || b.type !== "Polygon") return { ok: false, error: "not_polygon" };
  let u;
  try {
    u = turfUnion({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: a },
        { type: "Feature", properties: {}, geometry: b },
      ],
    });
  } catch {
    return { ok: false, error: "degenerate" };
  }
  if (!u) return { ok: false, error: "degenerate" };
  if (u.geometry.type !== "Polygon") return { ok: false, error: "not_adjacent" };
  const polygon = cleanArea(u.geometry as Area).geometry as Polygon;
  if (validatePolygon(polygon)) return { ok: false, error: "degenerate" };
  return { ok: true, polygon };
}
