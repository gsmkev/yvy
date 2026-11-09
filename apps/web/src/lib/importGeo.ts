/**
 * Importación de lotes (RF-11): KML, KMZ, GeoJSON y shapefile zipeado, parseados en el navegador.
 * Cada polígono se valida (cerrado, sin autointersección) y se calcula su superficie geodésica.
 */
import { kml } from "@tmcw/togeojson";
import JSZip from "jszip";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { areaHa, validatePolygon, type Area, type ValidationError } from "@yvy/geo";

export interface ImportedPolygon {
  index: number;
  name: string;
  geometry: Area;
  areaHa: number;
  error: ValidationError | null;
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
      const geometry = strip2d(f.geometry!) as Area;
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const key = NAME_KEYS.find((k) => props[k] !== undefined && props[k] !== "");
      const error = validatePolygon(geometry);
      return {
        index,
        name: key ? String(props[key]).trim() : `Lote ${index + 1}`,
        geometry,
        areaHa: error ? 0 : areaHa(geometry),
        error,
      };
    });
}

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
  if (name.endsWith(".kml"))
    return toPolygons(kml(new DOMParser().parseFromString(await file.text(), "text/xml")) as FeatureCollection);
  if (name.endsWith(".kmz")) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entry = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".kml"));
    if (!entry) throw new Error("El KMZ no tiene un archivo KML adentro");
    return toPolygons(kml(new DOMParser().parseFromString(await entry.async("text"), "text/xml")) as FeatureCollection);
  }
  if (name.endsWith(".zip")) {
    const shp = (await import("shpjs")).default;
    const result = (await shp(await file.arrayBuffer())) as FeatureCollection | FeatureCollection[];
    const fcs = Array.isArray(result) ? result : [result];
    return toPolygons({ type: "FeatureCollection", features: fcs.flatMap((f) => f.features) });
  }
  throw new Error("Formato no soportado. Usá KML, KMZ, GeoJSON o shapefile en .zip");
}
