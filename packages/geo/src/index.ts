/** Geometría del lado del cliente (web y app). El Worker solo valida forma. */
import turfArea from "@turf/area";
import turfBbox from "@turf/bbox";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import turfCentroid from "@turf/centroid";
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
