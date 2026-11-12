/** Geometría del lado del cliente (web y app). El Worker solo valida forma. */
import turfArea from "@turf/area";
import turfBbox from "@turf/bbox";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import turfCentroid from "@turf/centroid";
import intersect from "@turf/intersect";
import kinks from "@turf/kinks";
import type { MultiPolygon, Polygon, Position } from "geojson";

export type Area = Polygon | MultiPolygon;

export interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/** Área geodésica en hectáreas. */
export const areaHa = (g: Area): number => turfArea(g) / 10_000;

export const bboxOf = (g: Area): BBox => {
  const [minLon, minLat, maxLon, maxLat] = turfBbox(g);
  return { minLon, minLat, maxLon, maxLat };
};

export const centroidOf = (g: Area): { lon: number; lat: number } => {
  const [lon, lat] = turfCentroid(g).geometry.coordinates as [number, number];
  return { lon, lat };
};

export const containsPoint = (g: Area, lon: number, lat: number): boolean => booleanPointInPolygon([lon, lat], g);

export type ValidationError =
  "not_polygon" | "ring_too_short" | "ring_not_closed" | "coord_out_of_range" | "self_intersection";

const validRing = (ring: Position[]): ValidationError | null => {
  if (ring.length < 4) return "ring_too_short";
  const a = ring[0]!;
  const b = ring[ring.length - 1]!;
  if (a[0] !== b[0] || a[1] !== b[1]) return "ring_not_closed";
  for (const p of ring) {
    const [x, y] = p;
    if (typeof x !== "number" || typeof y !== "number" || x < -180 || x > 180 || y < -90 || y > 90) {
      return "coord_out_of_range";
    }
  }
  return null;
};

/** Validación barata de forma (apta para el Worker: sin kinks). */
export const validateShape = (g: unknown): ValidationError | null => {
  if (!g || typeof g !== "object") return "not_polygon";
  const geom = g as { type?: string; coordinates?: unknown };
  const polys: unknown[] =
    geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? (geom.coordinates as unknown[]) : [];
  if (!polys.length || !Array.isArray(polys[0])) return "not_polygon";
  for (const poly of polys) {
    if (!Array.isArray(poly) || poly.length === 0) return "not_polygon";
    for (const ring of poly) {
      if (!Array.isArray(ring)) return "not_polygon";
      const err = validRing(ring as Position[]);
      if (err) return err;
    }
  }
  return null;
};

/** Validación completa (cliente): forma + autointersecciones. */
export const validatePolygon = (g: unknown): ValidationError | null => {
  const shape = validateShape(g);
  if (shape) return shape;
  return kinks(g as Area).features.length > 0 ? "self_intersection" : null;
};

/** Todo lo que el servidor necesita guardar de una geometría ya validada. */
export const describeArea = (g: Area) => ({
  geometry: JSON.stringify(g),
  ...bboxOf(g),
  areaHa: areaHa(g),
});

// ---------------------------------------------------------------------------
// Limpieza de anillos (M-11)
// ---------------------------------------------------------------------------

const EPS = 1e-9;
const same = (a: Position, b: Position) => Math.abs(a[0]! - b[0]!) < EPS && Math.abs(a[1]! - b[1]!) < EPS;

/** a -> b -> c vuelve sobre sí mismo (c sobre la recta a-b del lado de a): b es una espiga de área cero. */
const isSpike = (a: Position, b: Position, c: Position): boolean => {
  const abx = b[0]! - a[0]!;
  const aby = b[1]! - a[1]!;
  const bcx = c[0]! - b[0]!;
  const bcy = c[1]! - b[1]!;
  const scale = Math.hypot(abx, aby) * Math.hypot(bcx, bcy);
  if (scale === 0) return true;
  const cross = abx * bcy - aby * bcx;
  return Math.abs(cross) / scale < 1e-9 && abx * bcx + aby * bcy < 0;
};

/**
 * Quita vértices consecutivos duplicados y espigas de área cero de un anillo cerrado.
 * Devuelve el anillo limpio (cerrado) y cuántos vértices se quitaron. Si quedaría con menos de
 * 4 posiciones se devuelve el original sin tocar para que la validación lo informe.
 */
export const cleanRing = (ring: Position[]): { ring: Position[]; removed: number } => {
  if (ring.length < 4) return { ring, removed: 0 };
  const open = same(ring[0]!, ring[ring.length - 1]!) ? ring.slice(0, -1) : ring.slice();
  const out: Position[] = [];
  for (const p of open) {
    if (out.length && same(out[out.length - 1]!, p)) continue;
    while (out.length >= 2 && isSpike(out[out.length - 2]!, out[out.length - 1]!, p)) out.pop();
    out.push(p);
  }
  // La unión entre el final y el inicio también puede tener duplicados o espigas.
  let changed = true;
  while (changed && out.length >= 3) {
    changed = false;
    const n = out.length;
    if (same(out[n - 1]!, out[0]!) || isSpike(out[n - 2]!, out[n - 1]!, out[0]!)) {
      out.pop();
      changed = true;
    } else if (isSpike(out[n - 1]!, out[0]!, out[1]!)) {
      out.shift();
      changed = true;
    }
  }
  if (out.length < 3) return { ring, removed: 0 };
  const closed = [...out, out[0]!];
  return { ring: closed, removed: ring.length - closed.length };
};

/** Aplica `cleanRing` a todos los anillos de un polígono o multipolígono. */
export const cleanArea = (g: Area): { geometry: Area; removed: number } => {
  let removed = 0;
  const rings = (rs: Position[][]) =>
    rs.map((r) => {
      const c = cleanRing(r);
      removed += c.removed;
      return c.ring;
    });
  const geometry: Area =
    g.type === "Polygon"
      ? { type: "Polygon", coordinates: rings(g.coordinates) }
      : { type: "MultiPolygon", coordinates: g.coordinates.map(rings) };
  return { geometry, removed };
};

// ---------------------------------------------------------------------------
// Superposición y contención (M-10)
// ---------------------------------------------------------------------------

type Box = [number, number, number, number];
const boxOf = (g: Area): Box => {
  const b = turfBbox(g);
  return [b[0], b[1], b[2], b[3]];
};

/** Área (grados²) de la intersección de dos cajas, 0 si no se tocan. Prefiltro barato antes de recortar. */
const boxOverlap = (a: Box, b: Box): number => {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
};

const intersectionHa = (a: Area, b: Area): number => {
  try {
    const r = intersect({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: a },
        { type: "Feature", properties: {}, geometry: b },
      ],
    });
    return r ? areaHa(r.geometry as Area) : 0;
  } catch {
    return 0; // geometría degenerada: mejor no avisar que romper la carga
  }
};

/** Parte de la figura más chica que cubre la otra (0 a 1). */
export const overlapRatio = (a: Area, b: Area): number => {
  if (boxOverlap(boxOf(a), boxOf(b)) === 0) return 0;
  const smaller = Math.min(areaHa(a), areaHa(b));
  return smaller > 0 ? Math.min(1, intersectionHa(a, b) / smaller) : 0;
};

/** Parte de `inner` que cae dentro de `outer` (0 a 1). */
export const withinRatio = (inner: Area, outer: Area): number => {
  if (boxOverlap(boxOf(inner), boxOf(outer)) === 0) return 0;
  const area = areaHa(inner);
  return area > 0 ? Math.min(1, intersectionHa(inner, outer) / area) : 1;
};

export const OVERLAP_WARN_RATIO = 0.01;
/** Un lote avisa como "fuera" si menos de esta parte de su superficie queda adentro de la estancia. */
export const WITHIN_WARN_RATIO = 0.99;

export interface GeoWarning {
  kind: "overlap" | "outside";
  /** Índices en la lista de entrada. */
  a: number;
  b?: number;
  ratio: number;
}

/**
 * Avisos no bloqueantes: lotes que se superponen entre sí (> 1 % del más chico) y lotes que salen
 * del perímetro. `maxExact` limita los recortes exactos (presupuesto de CPU del Worker).
 */
export const checkPlots = (plots: Area[], farm: Area | null, opts: { maxExact?: number } = {}): GeoWarning[] => {
  const out: GeoWarning[] = [];
  let budget = opts.maxExact ?? Infinity;
  const boxes = plots.map(boxOf);
  for (let i = 0; i < plots.length; i++) {
    for (let j = i + 1; j < plots.length; j++) {
      if (boxOverlap(boxes[i]!, boxes[j]!) === 0 || budget-- <= 0) continue;
      const r = overlapRatio(plots[i]!, plots[j]!);
      if (r > OVERLAP_WARN_RATIO) out.push({ kind: "overlap", a: i, b: j, ratio: r });
    }
  }
  if (farm) {
    const fb = boxOf(farm);
    for (let i = 0; i < plots.length; i++) {
      if (boxOverlap(boxes[i]!, fb) === 0) {
        out.push({ kind: "outside", a: i, ratio: 0 });
        continue;
      }
      if (budget-- <= 0) continue;
      const r = withinRatio(plots[i]!, farm);
      if (r < WITHIN_WARN_RATIO) out.push({ kind: "outside", a: i, ratio: r });
    }
  }
  return out;
};

export * from "./edit";
export * from "./track";
export * from "./sampling";
export * from "./distance";
