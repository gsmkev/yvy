import type { StyleSpecification } from "@maplibre/maplibre-react-native";
import { BRAND, LIMITS } from "@yvy/shared";
import type { Farm, Plot, Poi } from "../db/store";
import type { Fix } from "../lib/location";
import { layerSource, type MapLayer } from "../lib/offline";

export const daysAgo = (ms: number) => Math.floor((Date.now() - ms) / 86_400_000);

type Sources = StyleSpecification["sources"];
type Layers = StyleSpecification["layers"];
type LonLat = { lon: number; lat: number };

export type MapStyleInput = {
  farms: Farm[];
  plots: Plot[];
  records: { lon: number | null; lat: number | null; pending: boolean }[];
  pois: Poi[];
  taskPoints: LonLat[];
  me: Fix | null;
  selected: string | null;
  lastVisit: Map<string, number>;
  mode: MapLayer;
  remoteBase: string | null;
};

const feature = (geometry: string, properties: Record<string, unknown> = {}) => ({ type: "Feature" as const, properties, geometry: JSON.parse(geometry) });

const points = (list: { lon: number; lat: number; properties?: Record<string, unknown> }[]) => ({
  type: "geojson" as const,
  data: {
    type: "FeatureCollection" as const,
    features: list.map((p) => ({ type: "Feature" as const, properties: p.properties ?? {}, geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] } })),
  },
});

/** Una capa ráster por estancia con satélite (o NDVI), sobre el fondo oscuro. */
function baseLayers({ farms, mode, remoteBase }: MapStyleInput, sources: Sources, layers: Layers) {
  for (const f of farms) {
    const src = layerSource(f.id, mode, remoteBase);
    if (src) {
      sources[`base-${f.id}`] = { type: "raster", url: src.url, tileSize: 256 };
      layers.push({ id: `base-${f.id}`, type: "raster", source: `base-${f.id}` });
    }
  }
}

function dataSources({ farms, plots, records, pois, taskPoints, me, selected, lastVisit }: MapStyleInput, sources: Sources) {
  sources.farms = { type: "geojson", data: { type: "FeatureCollection", features: farms.map((f) => feature(f.geometry)) } };
  sources.plots = {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: plots.map((p) => feature(p.geometry, { sel: p.id === selected ? 1 : 0, stale: (lastVisit.get(p.id) ? daysAgo(lastVisit.get(p.id)!) : 99) >= LIMITS.visits.defaultStaleDays ? 1 : 0 })),
    },
  };
  sources.records = points(records.filter((r) => r.lat !== null).map((r) => ({ lon: r.lon!, lat: r.lat!, properties: { pending: r.pending ? 1 : 0 } })));
  sources.pois = points(pois);
  sources.tasks = points(taskPoints);
  if (me) sources.me = { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [me.lon, me.lat] } } };
}

function overlayLayers(me: Fix | null): Layers {
  const layers: Layers = [
    { id: "farms", type: "line", source: "farms", paint: { "line-color": "rgba(255,255,255,0.9)", "line-width": 2 } },
    { id: "plots-fill", type: "fill", source: "plots", paint: { "fill-color": "#ffffff", "fill-opacity": ["case", ["==", ["get", "sel"], 1], 0.28, 0.04] } },
    {
      id: "plots-line",
      type: "line",
      source: "plots",
      paint: {
        "line-color": ["case", ["==", ["get", "sel"], 1], "#ffffff", ["==", ["get", "stale"], 1], BRAND.trigo, "rgba(255,255,255,0.7)"],
        "line-width": ["case", ["==", ["get", "sel"], 1], 3, 1.5],
      },
    },
    { id: "records", type: "circle", source: "records", paint: { "circle-radius": 5, "circle-color": ["case", ["==", ["get", "pending"], 1], BRAND.trigo, BRAND.lino], "circle-stroke-width": 1.5, "circle-stroke-color": "#141a12" } },
    { id: "pois", type: "circle", source: "pois", paint: { "circle-radius": 6, "circle-color": BRAND.cielo, "circle-stroke-width": 2, "circle-stroke-color": "#141a12" } },
    { id: "tasks", type: "circle", source: "tasks", paint: { "circle-radius": 9, "circle-color": BRAND.alerta, "circle-stroke-width": 2.5, "circle-stroke-color": "#ffffff" } },
  ];
  if (me) {
    layers.push(
      { id: "me-halo", type: "circle", source: "me", paint: { "circle-radius": 18, "circle-color": BRAND.cielo, "circle-opacity": 0.3 } },
      { id: "me", type: "circle", source: "me", paint: { "circle-radius": 7, "circle-color": BRAND.cielo, "circle-stroke-width": 2.5, "circle-stroke-color": "#ffffff" } },
    );
  }
  return layers;
}

/** Estilo del mapa: satélite por estancia, lotes, anotaciones, puntos, tareas y "dónde estoy" (en ese orden de capas). */
export function buildMapStyle(input: MapStyleInput): StyleSpecification {
  const sources: Sources = {};
  const layers: Layers = [{ id: "bg", type: "background", paint: { "background-color": "#141a12" } }];
  baseLayers(input, sources, layers);
  dataSources(input, sources);
  layers.push(...overlayLayers(input.me));
  return { version: 8, sources, layers };
}
