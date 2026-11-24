import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import pointOnFeature from "@turf/point-on-feature";

export const fc = (features: Feature[]): FeatureCollection => ({ type: "FeatureCollection", features });

export const boundsOf = (o: {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}): [number, number, number, number] => [o.minLon, o.minLat, o.maxLon, o.maxLat];


/** Punto garantizado dentro del polígono (el centro del bbox cae afuera en lotes en L o U). */
export function labelPoint(g: Polygon | MultiPolygon): [number, number] {
  return pointOnFeature({ type: "Feature", properties: {}, geometry: g }).geometry.coordinates as [number, number];
}
