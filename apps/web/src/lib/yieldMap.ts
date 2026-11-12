/**
 * Mapas de rendimiento de la cosechadora (A-21): shapefile (zip) o GeoJSON con puntos o polígonos y un campo de
 * rendimiento. Se parsea en el navegador (el Worker no procesa archivos): se limpia, se recorta al lote, se pasa a
 * t/ha y se resume en una grilla chica que es lo único que se manda a guardar.
 */
import JSZip from "jszip";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { centroidOf, containsPoint, type Area } from "@yvy/geo";
import { t } from "./i18n";

export type YieldUnit = "t_ha" | "kg_ha" | "bu_ac";
export const YIELD_UNITS: readonly YieldUnit[] = ["t_ha", "kg_ha", "bu_ac"];

/** t/ha por bushel/acre según el cultivo (soja y trigo 60 lb/bu; maíz 56 lb/bu). */
export const BU_AC_TO_T_HA: Record<string, number> = { soja: 0.06725, trigo: 0.06725, maiz: 0.06277, default: 0.06725 };

export const MAX_CELLS = 800;

/** Nombres habituales del campo de rendimiento en monitores de cosechadora (John Deere, Case, New Holland, Trimble). */
const YIELD_FIELDS = [
  "yld_vol_dr",
  "yld_mass_dr",
  "vryieldvol",
  "vryieldmass",
  "yield",
  "yld",
  "dry_yield",
  "rendimiento",
  "rendimient",
  "rinde",
  "prod",
  "productiv",
];

export interface YieldPoint {
  lon: number;
  lat: number;
  v: number;
}

/** Campos numéricos de las propiedades, con el más probable de rendimiento primero. */
export function numericFields(fc: FeatureCollection): string[] {
  const seen = new Map<string, number>();
  for (const f of fc.features.slice(0, 200)) {
    for (const [k, v] of Object.entries(f.properties ?? {})) {
      if (typeof v === "number" && Number.isFinite(v)) seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  }
  const names = [...seen.keys()];
  const rank = (k: string) => {
    const i = YIELD_FIELDS.findIndex((y) => k.toLowerCase().includes(y));
    return i === -1 ? 99 : i;
  };
  return names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Puntos {lon, lat, valor}: un punto vale por sí mismo y un polígono por su centroide. Descarta lo que no es número. */
export function extractPoints(fc: FeatureCollection, field: string): YieldPoint[] {
  const out: YieldPoint[] = [];
  const visit = (g: Geometry | null, v: unknown) => {
    if (!g || typeof v !== "number" || !Number.isFinite(v)) return;
    if (g.type === "Point") out.push({ lon: g.coordinates[0]!, lat: g.coordinates[1]!, v });
    else if (g.type === "MultiPoint") for (const p of g.coordinates as Position[]) out.push({ lon: p[0]!, lat: p[1]!, v });
    else if (g.type === "Polygon" || g.type === "MultiPolygon") {
      const c = centroidOf(g as Area);
      out.push({ lon: c.lon, lat: c.lat, v });
    } else if (g.type === "GeometryCollection") for (const x of g.geometries) visit(x, v);
  };
  for (const f of fc.features as Feature[]) visit(f.geometry, (f.properties ?? {})[field]);
  return out;
}

export const toTHa = (v: number, unit: YieldUnit, crop: string | null): number =>
  unit === "t_ha" ? v : unit === "kg_ha" ? v / 1000 : v * (BU_AC_TO_T_HA[crop ?? "default"] ?? BU_AC_TO_T_HA.default!);

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo]! + (sorted[Math.ceil(i)]! - sorted[lo]!) * (i - lo);
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface YieldSummary {
  /** Puntos que entraron (adentro del lote y sin valores absurdos). */
  nPoints: number;
  /** Puntos descartados: fuera del lote, no positivos o atípicos. */
  nDropped: number;
  meanTHa: number;
  p10THa: number;
  p90THa: number;
  minTHa: number;
  maxTHa: number;
  cvPct: number;
  cellM: number;
  /** [lon, lat, rinde t/ha, puntos]: grilla de promedios, máximo MAX_CELLS. */
  cells: [number, number, number, number][];
}

/**
 * Resume los puntos de un lote: pasa a t/ha, descarta lo que está fuera del lote, no es positivo o se aleja más
 * de 3,5 desvíos absolutos de la mediana (puntos de giro, arranque y barras mal calibradas), y promedia en una grilla
 * cuya celda crece hasta que no pasen de MAX_CELLS.
 */
export function summarizeYield(
  points: YieldPoint[],
  unit: YieldUnit,
  crop: string | null,
  plot: Area,
  cellM = 20,
): YieldSummary | null {
  const converted = points.map((p) => ({ ...p, v: toTHa(p.v, unit, crop) }));
  const inside = converted.filter((p) => p.v > 0 && containsPoint(plot, p.lon, p.lat));
  if (inside.length < 3) return null;
  const sorted = inside.map((p) => p.v).sort((a, b) => a - b);
  const med = quantile(sorted, 0.5);
  const mad = quantile(sorted.map((v) => Math.abs(v - med)).sort((a, b) => a - b), 0.5);
  const keep = mad > 0 ? inside.filter((p) => Math.abs(p.v - med) <= 3.5 * 1.4826 * mad) : inside;
  if (keep.length < 3) return null;
  const vals = keep.map((p) => p.v).sort((a, b) => a - b);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  const lat0 = keep.reduce((a, p) => a + p.lat, 0) / keep.length;
  let size = cellM;
  for (;;) {
    const dLat = size / 111_320;
    const dLon = size / (111_320 * Math.cos((lat0 * Math.PI) / 180));
    const cells = new Map<string, { sx: number; sy: number; sv: number; n: number }>();
    for (const p of keep) {
      const k = `${Math.floor(p.lon / dLon)}|${Math.floor(p.lat / dLat)}`;
      const c = cells.get(k) ?? { sx: 0, sy: 0, sv: 0, n: 0 };
      c.sx += p.lon;
      c.sy += p.lat;
      c.sv += p.v;
      c.n++;
      cells.set(k, c);
    }
    if (cells.size <= MAX_CELLS) {
      return {
        nPoints: keep.length,
        nDropped: points.length - keep.length,
        meanTHa: r2(mean),
        p10THa: r2(quantile(vals, 0.1)),
        p90THa: r2(quantile(vals, 0.9)),
        minTHa: r2(vals[0]!),
        maxTHa: r2(vals[vals.length - 1]!),
        cvPct: mean > 0 ? Math.round((sd / mean) * 1000) / 10 : 0,
        cellM: size,
        cells: [...cells.values()].map((c) => [
          Math.round((c.sx / c.n) * 1e5) / 1e5,
          Math.round((c.sy / c.n) * 1e5) / 1e5,
          r2(c.sv / c.n),
          c.n,
        ]),
      };
    }
    size = Math.ceil(size * 1.5);
  }
}

/** Lee un .zip con shapefile o un .geojson/.json y devuelve los elementos con sus propiedades. */
export async function readYieldFile(file: File): Promise<FeatureCollection> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".geojson") || name.endsWith(".json")) {
    const json = JSON.parse(await file.text()) as FeatureCollection | Feature;
    return json.type === "FeatureCollection" ? json : { type: "FeatureCollection", features: [json] };
  }
  if (name.endsWith(".zip")) {
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    if (!Object.values(zip.files).some((f) => f.name.toLowerCase().endsWith(".shp"))) throw new Error(t("ui.importZipNoShp"));
    const shp = (await import("shpjs")).default;
    const result = (await shp(buf)) as FeatureCollection | FeatureCollection[];
    const fcs = Array.isArray(result) ? result : [result];
    return { type: "FeatureCollection", features: fcs.flatMap((f) => f.features) };
  }
  throw new Error(t("ui.yieldFileUnsupported"));
}
