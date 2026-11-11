import type { Polygon } from "geojson";
import { areaHa } from "@yvy/geo";

export type LonLat = [number, number];

const R = 6_371_008.8; // radio medio de la Tierra, m
const rad = (d: number) => (d * Math.PI) / 180;

/** Distancia entre dos puntos (haversine), en metros. */
export function distanceM(a: LonLat, b: LonLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Largo de la poligonal; con `closed` suma también el tramo de vuelta al primer punto (perímetro). */
export function pathLengthM(points: LonLat[], closed = false): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceM(points[i - 1]!, points[i]!);
  if (closed && points.length > 2) total += distanceM(points[points.length - 1]!, points[0]!);
  return total;
}

/** Superficie en ha de la forma cerrada, o null si todavía no es un polígono. */
export function closedAreaHa(points: LonLat[]): number | null {
  if (points.length < 3) return null;
  const ring = [...points, points[0]!];
  const g: Polygon = { type: "Polygon", coordinates: [ring] };
  return areaHa(g);
}

const nf = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });

/** "850 m" por debajo del kilómetro, "1,25 km" desde ahí. */
export const fmtDistance = (m: number) => (m < 1000 ? `${nf.format(m)} m` : `${nf2.format(m / 1000)} km`);
