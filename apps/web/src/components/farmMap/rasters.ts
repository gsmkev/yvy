import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { BRAND } from "@yvy/shared";
import { t } from "../../lib/i18n";
import { pickLayer } from "../../lib/scenes";
import type { Layer } from "../../lib/types";
import type { FarmMapProps } from "./types";

/** Mapa base de Paraguay en R2 (bucket yvy-tiles), publicado por el job country_basemap. */
const COUNTRY_BASEMAP = "base/paraguay.pmtiles";
export const DEV_BASEMAP = import.meta.env.DEV || import.meta.env.VITE_DEV_BASEMAP === "1";

/** M-16: la fuente se agrega solo con datos, así la atribución "geoBoundaries" aparece únicamente con la capa activa. */
export function syncBoundaries(map: MlMap, data: FeatureCollection | null) {
  const src = map.getSource("boundaries") as GeoJSONSource | undefined;
  if (!data) {
    if (map.getLayer("boundaries-line")) map.removeLayer("boundaries-line");
    if (map.getLayer("boundaries-fill")) map.removeLayer("boundaries-fill");
    if (src) map.removeSource("boundaries");
    return;
  }
  if (src) return src.setData(data);
  map.addSource("boundaries", { type: "geojson", data, attribution: t("attribution.common.geoBoundaries") });
  const before = map.getLayer("plots-fill") ? "plots-fill" : undefined;
  map.addLayer(
    { id: "boundaries-fill", type: "fill", source: "boundaries", paint: { "fill-color": "#000", "fill-opacity": 0 } },
    before,
  );
  map.addLayer(
    {
      id: "boundaries-line",
      type: "line",
      source: "boundaries",
      paint: { "line-color": BRAND.cielo, "line-width": 1.5, "line-opacity": 0.9 },
    },
    before,
  );
}

/** M-17: cada imagen propia es una fuente `image` con sus 4 esquinas; se quitan las que ya no están activas. */
export function syncCustomImages(map: MlMap, images: NonNullable<FarmMapProps["customImages"]>) {
  const want = new Set(images.map((i) => `custom-${i.id}`));
  for (const l of map.getStyle().layers ?? [])
    if (l.id.startsWith("custom-") && !want.has(l.id)) {
      map.removeLayer(l.id);
      if (map.getSource(l.id)) map.removeSource(l.id);
    }
  for (const img of images) {
    const id = `custom-${img.id}`;
    const src = map.getSource(id) as { url?: string; updateImage?: (o: { url: string; coordinates: number[][] }) => void } | undefined;
    if (src && src.url !== img.url) {
      map.removeLayer(id);
      map.removeSource(id);
    }
    if (!map.getSource(id)) {
      map.addSource(id, { type: "image", url: img.url, coordinates: img.corners as [[number, number], [number, number], [number, number], [number, number]] });
      map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": img.opacity, "raster-fade-duration": 0 } }, map.getLayer("outline") ? "outline" : undefined);
    } else map.setPaintProperty(id, "raster-opacity", img.opacity);
  }
}

export function syncRasters(map: MlMap, p: FarmMapProps) {
  const latest = (layer: Layer["layer"]) => pickLayer(p.layers ?? [], layer, p.layerIds?.[layer]);
  const set = (id: string, layer: Layer | undefined, visible: boolean, before: string) => {
    const url = layer && p.tilesBaseUrl ? `pmtiles://${p.tilesBaseUrl.replace(/\/$/, "")}/${layer.pmtilesPath}` : null;
    const src = map.getSource(id) as { url?: string } | undefined;
    if (src && (!url || src.url !== url)) {
      map.removeLayer(id);
      map.removeSource(id);
    }
    if (url && !map.getSource(id)) {
      map.addSource(id, { type: "raster", url, tileSize: 256, attribution: "Copernicus Sentinel" });
      map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": id === "ndvi" ? 0.85 : 1 } }, before);
    }
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  };
  // Fondo de todo el país (job country_basemap, ~160 m): siempre debajo de los mapas base de cada estancia
  if (!DEV_BASEMAP) {
    const first = map.getStyle().layers.find((l) => l.id.startsWith("basemap") || l.id === "ndvi")?.id ?? "outline";
    set("country", { id: "country", layer: "true_color", acquiredAt: 0, pmtilesPath: COUNTRY_BASEMAP, bytes: 0, bounds: "" }, true, first);
  }
  set("basemap", latest("true_color"), true, "outline");
  for (const f of p.farms ?? []) {
    if (f.basemapPath)
      set(
        `basemap-${f.id}`,
        { id: f.id, layer: "true_color", acquiredAt: 0, pmtilesPath: f.basemapPath, bytes: 0, bounds: "" },
        true,
        "outline",
      );
  }
  set("ndvi", latest(p.indexKind ?? "ndvi"), !!p.showNdvi, "outline");
}
