/** Edición de vértices de un lote dibujado en el celular (M-03). Lógica pura: la pantalla solo la dibuja. */
import { areaHa, validatePolygon, type Area } from "@yvy/geo";
import { LIMITS } from "@yvy/shared";
import type { Polygon } from "geojson";

export type V = [number, number];

/** Vértices del anillo exterior sin el punto de cierre. null si no se puede editar en el celular (huecos o varias partes). */
export function verticesOf(g: Area): V[] | null {
  if (g.type !== "Polygon" || g.coordinates.length !== 1) return null;
  const ring = g.coordinates[0]!;
  return ring.slice(0, -1).map((p) => [p[0]!, p[1]!] as V);
}

const M_PER_DEG_LAT = 111_320;

const distToSegmentM = (p: V, a: V, b: V): number => {
  const mLon = M_PER_DEG_LAT * Math.cos((p[1] * Math.PI) / 180);
  const px = (p[0] - a[0]) * mLon;
  const py = (p[1] - a[1]) * M_PER_DEG_LAT;
  const bx = (b[0] - a[0]) * mLon;
  const by = (b[1] - a[1]) * M_PER_DEG_LAT;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
};

/** Agrega al final (dibujando) o, con `onEdge`, dentro del lado más cercano del polígono cerrado (editando). */
export function addVertex(vs: V[], p: V, onEdge: boolean): V[] {
  if (!onEdge || vs.length < 3) return [...vs, p];
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < vs.length; i++) {
    const d = distToSegmentM(p, vs[i]!, vs[(i + 1) % vs.length]!);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return [...vs.slice(0, best + 1), p, ...vs.slice(best + 1)];
}

export const moveVertex = (vs: V[], i: number, p: V): V[] => vs.map((v, k) => (k === i ? p : v));
export const removeVertex = (vs: V[], i: number): V[] => vs.filter((_, k) => k !== i);

export type DraftError = "too_few" | "invalid" | "self_intersection" | "too_small";

/** Polígono cerrado y su superficie, o el motivo por el que todavía no se puede guardar. */
export function checkDraft(vs: V[]): { polygon: Polygon; ha: number } | { error: DraftError } {
  if (vs.length < 3) return { error: "too_few" };
  const polygon: Polygon = { type: "Polygon", coordinates: [[...vs, vs[0]!]] };
  const err = validatePolygon(polygon);
  if (err === "self_intersection") return { error: "self_intersection" };
  if (err) return { error: "invalid" };
  const ha = areaHa(polygon);
  if (ha < LIMITS.geometry.minPlotHa) return { error: "too_small" };
  return { polygon, ha };
}
