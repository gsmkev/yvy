/**
 * Importación de lotes (RF-11): KML, KMZ, GeoJSON y shapefile zipeado, parseados en el navegador.
 * Cada polígono se valida (cerrado, sin autointersección) y se calcula su superficie geodésica.
 */
import { kml } from "@tmcw/togeojson";
import JSZip from "jszip";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { t } from "./i18n";
import { areaHa, cleanArea, validatePolygon, type Area, type ValidationError } from "@yvy/geo";

export interface ImportedPolygon {
  index: number;
  name: string;
  geometry: Area;
  areaHa: number;
  error: ValidationError | null;
  /** Vértices duplicados o espigas quitados al limpiar (M-11). */
  fixed: number;
}

const NAME_KEYS = ["name", "Name", "NOMBRE", "nombre", "LOTE", "lote", "id", "ID"];

function flatten(fc: FeatureCollection): Feature[] {
  const out: Feature[] = [];
  for (const f of fc.features) {
    if (!f.geometry) continue;
    if (f.geometry.type === "GeometryCollection") {
      for (const g of f.geometry.geometries) out.push({ ...f, geometry: g });
    } else out.push(f);
  }
  return out;
}

/** Quita la coordenada Z (KML suele traer altura) para que la validación y el área sean 2D. */
function strip2d(g: Geometry): Geometry {
  const ring = (r: number[][]) => r.map((p) => [p[0]!, p[1]!]);
  if (g.type === "Polygon") return { type: "Polygon", coordinates: g.coordinates.map(ring) };
  if (g.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: g.coordinates.map((p) => p.map(ring)) };
  return g;
}

export function toPolygons(fc: FeatureCollection): ImportedPolygon[] {
  return flatten(fc)
    .filter((f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"))
    .map((f, index) => {
      const cleaned = cleanArea(strip2d(f.geometry!) as Area);
      const geometry = cleaned.geometry;
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const key = NAME_KEYS.find((k) => props[k] !== undefined && props[k] !== "");
      const error = validatePolygon(geometry);
      return {
        index,
        name: key ? String(props[key]).trim() : `Lote ${index + 1}`,
        geometry,
        areaHa: error ? 0 : areaHa(geometry),
        error,
        fixed: cleaned.removed,
      };
    });
}

const fromKml = (text: string): ImportedPolygon[] =>
  toPolygons(kml(new DOMParser().parseFromString(text, "text/xml")) as FeatureCollection);

/**
 * Sistema de coordenadas de un .prj: WGS84 (o SIRGAS 2000, equivalente a efectos prácticos),
 * UTM zona 20S/21S (las de Paraguay) u otro, que no se importa.
 */
export function classifyPrj(prj: string): "wgs84" | "utm" | "unsupported" {
  const txt = prj.trim();
  if (/PROJCS|PROJCRS/i.test(txt)) {
    const utm = /UTM[\s_]*zone[\s_]*(20|21)[\s_]*S/i.test(txt) || /\bEPSG\D{0,3}(327(20|21)|319(80|81))\b/i.test(txt);
    const meridian = /central_meridian",\s*-?(63|57)\b/i.test(txt) && /false_northing",\s*10000000/i.test(txt);
    return utm || meridian ? "utm" : "unsupported";
  }
  if (/GEOGCS|GEODCRS|GEOGCRS/i.test(txt) && /WGS[_\s]?(19)?84|SIRGAS|EPSG\D{0,3}(4326|4674)/i.test(txt)) return "wgs84";
  return "unsupported";
}

const inWgs84Range = (fc: FeatureCollection): boolean => {
  const ok = (v: unknown): boolean =>
    Array.isArray(v) ? (typeof v[0] === "number" ? Math.abs(v[0]) <= 180 && Math.abs(v[1] as number) <= 90 : v.every(ok)) : true;
  return fc.features.every((f) => !f.geometry || f.geometry.type === "GeometryCollection" || ok(f.geometry.coordinates));
};

export async function parseFile(file: File): Promise<ImportedPolygon[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".geojson") || name.endsWith(".json")) {
    const json = JSON.parse(await file.text()) as FeatureCollection | Feature | Geometry;
    const fc: FeatureCollection =
      json.type === "FeatureCollection"
        ? json
        : json.type === "Feature"
          ? { type: "FeatureCollection", features: [json] }
          : { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: json as Geometry }] };
    return toPolygons(fc);
  }
  if (name.endsWith(".kml")) return fromKml(await file.text());
  if (name.endsWith(".kmz")) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entry = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".kml"));
    if (!entry) throw new Error(t("ui.importKmzNoKml"));
    return fromKml(await entry.async("text"));
  }
  if (name.endsWith(".zip")) {
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const files = Object.values(zip.files).filter((f) => !f.dir);
    if (!files.some((f) => f.name.toLowerCase().endsWith(".shp"))) {
      const kmlEntry = files.find((f) => f.name.toLowerCase().endsWith(".kml"));
      if (kmlEntry) return fromKml(await kmlEntry.async("text"));
      throw new Error(t("ui.importZipNoShp"));
    }
    // Solo WGS84 o UTM 20S/21S; shpjs (proj4, carga diferida) reproyecta a WGS84 con el .prj.
    for (const prj of files.filter((f) => f.name.toLowerCase().endsWith(".prj"))) {
      if (classifyPrj(await prj.async("text")) === "unsupported") throw new Error(t("ui.importCrsUnsupported"));
    }
    const shp = (await import("shpjs")).default;
    const result = (await shp(buf)) as FeatureCollection | FeatureCollection[];
    const fcs = Array.isArray(result) ? result : [result];
    const fc: FeatureCollection = { type: "FeatureCollection", features: fcs.flatMap((f) => f.features) };
    if (!inWgs84Range(fc)) throw new Error(t("ui.importCrsUnknown"));
    return toPolygons(fc);
  }
  throw new Error(t("ui.importUnsupported"));
}
