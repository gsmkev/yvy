/** Estilo MapLibre del mapa de dibujo de lotes. */
import type { StyleSpecification } from "@maplibre/maplibre-react-native";
import type { Farm, Plot } from "../db/store";
import { layerSource } from "../lib/offline";
import type { V } from "../lib/plotDraft";

/** Estilo del mapa de dibujo: satélite de la estancia, su borde, los otros lotes y el borrador en trigo. */
export function buildDrawStyle(farm: Farm | undefined, others: Plot[], vs: V[], remoteBase: string | null): StyleSpecification {
  const sources: StyleSpecification["sources"] = {};
  const layers: StyleSpecification["layers"] = [{ id: "bg", type: "background", paint: { "background-color": "#141a12" } }];
  if (farm) {
    const src = layerSource(farm.id, "true_color", remoteBase);
    if (src) {
      sources.base = { type: "raster", url: src.url, tileSize: 256 };
      layers.push({ id: "base", type: "raster", source: "base" });
    }
    sources.farm = { type: "geojson", data: { type: "Feature", properties: {}, geometry: JSON.parse(farm.geometry) } };
    layers.push({ id: "farm", type: "line", source: "farm", paint: { "line-color": "rgba(255,255,255,0.9)", "line-width": 2 } });
  }
  sources.others = {
    type: "geojson",
    data: { type: "FeatureCollection", features: others.map((p) => ({ type: "Feature" as const, properties: {}, geometry: JSON.parse(p.geometry) })) },
  };
  layers.push({ id: "others", type: "line", source: "others", paint: { "line-color": "rgba(255,255,255,0.55)", "line-width": 1.5 } });
  const ring = vs.length >= 3 ? [...vs, vs[0]!] : vs;
  sources.draft = {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [
        ...(vs.length >= 3 ? [{ type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring] } }] : []),
        ...(vs.length >= 2 ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: ring } }] : []),
      ],
    },
  };
  layers.push(
    { id: "draft-fill", type: "fill", source: "draft", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#D9A93A", "fill-opacity": 0.25 } },
    // Pendiente = borde punteado trigo; el lote guardado y sincronizado va sólido
    { id: "draft-line", type: "line", source: "draft", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#D9A93A", "line-width": 3, "line-dasharray": [2, 1.5] } },
  );
  return { version: 8, sources, layers };
}
