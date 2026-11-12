/**
 * A-22: rinde frente a vigor por zona de manejo. El rinde de cada zona sale de las celdas del mapa de rinde de la
 * cosechadora que caen dentro de la zona; el vigor es el NDVI medio de la zona (A-32). Sin celdas suficientes
 * no se afirma nada.
 */
import { containsPoint, type Area } from "@yvy/geo";

export interface ZoneInput {
  zone: 1 | 2 | 3;
  areaHa: number;
  meanNdvi: number;
  geometry: string;
}

export interface ZoneYield {
  zone: 1 | 2 | 3;
  areaHa: number;
  ndvi: number;
  /** t/ha medio de la zona, ponderado por los puntos de cada celda; null si no cayó ninguna celda. */
  meanTHa: number | null;
  nCells: number;
}

/** Celdas mínimas dentro de una zona para fiarse de su rinde. */
export const MIN_CELLS_PER_ZONE = 5;
/** Diferencia entre la zona alta y la baja (en %) por debajo de la cual no se habla de diferencia. */
export const FLAT_PCT = 5;

export function zoneYields(zones: ZoneInput[], cells: [number, number, number, number][]): ZoneYield[] {
  return [...zones]
    .sort((a, b) => a.zone - b.zone)
    .map((z) => {
      const geom = JSON.parse(z.geometry) as Area;
      let sum = 0;
      let w = 0;
      let n = 0;
      for (const [lon, lat, t, pts] of cells) {
        if (!containsPoint(geom, lon, lat)) continue;
        sum += t * pts;
        w += pts;
        n++;
      }
      return { zone: z.zone, areaHa: z.areaHa, ndvi: z.meanNdvi, meanTHa: w > 0 ? sum / w : null, nCells: n };
    });
}

export type YieldVigorReading =
  | { kind: "insufficient" }
  | { kind: "flat" | "follows" | "inverse" | "mixed"; diffPct: number; lowZone: number; highZone: number };

/** Lectura honesta: con menos de dos zonas con datos suficientes, no hay comparación. */
export function readYieldVigor(rows: ZoneYield[]): YieldVigorReading {
  const ok = rows.filter((r) => r.meanTHa !== null && r.nCells >= MIN_CELLS_PER_ZONE);
  if (ok.length < 2) return { kind: "insufficient" };
  const lo = ok[0]!;
  const hi = ok[ok.length - 1]!;
  const base = lo.meanTHa!;
  if (base <= 0) return { kind: "insufficient" };
  const diffPct = ((hi.meanTHa! - base) / base) * 100;
  const out = { diffPct, lowZone: lo.zone, highZone: hi.zone };
  if (Math.abs(diffPct) < FLAT_PCT) return { kind: "flat", ...out };
  if (diffPct <= -FLAT_PCT) return { kind: "inverse", ...out };
  const rising = ok.every((r, i) => i === 0 || r.meanTHa! >= ok[i - 1]!.meanTHa! - 1e-9);
  return { kind: rising ? "follows" : "mixed", ...out };
}

/** t/ha de un lote en una campaña a partir de las cosechas registradas; null si no hay cosechas. */
export function harvestYield(
  records: { data: Record<string, unknown> }[],
  plotAreaHa: number,
  seasonId: string | null,
): { tHa: number; tons: number; count: number } | null {
  const rs = records.filter((r) => typeof r.data.tons === "number" && (seasonId === null || r.data.seasonId === seasonId));
  if (rs.length === 0) return null;
  const tons = rs.reduce((a, r) => a + (r.data.tons as number), 0);
  const done = rs.map((r) => r.data.areaHa);
  // Si todas traen superficie cosechada se usa esa; si no, la del lote entero
  const area = done.every((a) => typeof a === "number") ? (done as number[]).reduce((a, b) => a + b, 0) : plotAreaHa;
  return area > 0 ? { tHa: tons / area, tons, count: rs.length } : null;
}
