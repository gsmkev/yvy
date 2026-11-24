import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from "maplibre-gl";
import type { Point } from "geojson";
import { BRAND } from "@yvy/shared";
import { addPoiImages } from "../../lib/poiMarkers";
import { fc } from "./geo";

export function addSources(map: MlMap, clusterPoints: boolean | undefined) {
  map.addSource("outline", { type: "geojson", data: fc([]) });
  map.addSource("plots", { type: "geojson", data: fc([]) });
  map.addSource("pois", { type: "geojson", data: fc([]) });
  map.addSource("problems", { type: "geojson", data: fc([]) });
  map.addSource(
    "points",
    clusterPoints
      ? { type: "geojson", data: fc([]), cluster: true, clusterRadius: 32, clusterMaxZoom: 15 }
      : { type: "geojson", data: fc([]) },
  );
  map.addSource("measure", { type: "geojson", data: fc([]) });
  map.addSource("lines", { type: "geojson", data: fc([]) });
  map.addSource("heat", { type: "geojson", data: fc([]) });
}

function addOutlineAndPlotLayers(map: MlMap) {
  map.addLayer({
    id: "outline",
    type: "line",
    source: "outline",
    paint: {
      "line-color": ["case", ["boolean", ["get", "alert"], false], BRAND.alerta, "rgba(255,255,255,0.9)"],
      "line-width": 2,
    },
  });
  map.addLayer({
    id: "plots-fill",
    type: "fill",
    source: "plots",
    paint: {
      "fill-color": ["coalesce", ["get", "color"], "#ffffff"],
      "fill-opacity": ["case", ["boolean", ["get", "selected"], false], 0.28, 0.04],
    },
  });
  map.addLayer({
    id: "plots-line",
    type: "line",
    source: "plots",
    paint: {
      "line-color": [
        "case",
        ["boolean", ["get", "selected"], false],
        "#ffffff",
        ["boolean", ["get", "stale"], false],
        BRAND.trigo,
        ["coalesce", ["get", "color"], "rgba(255,255,255,0.7)"],
      ],
      "line-width": ["case", ["boolean", ["get", "selected"], false], 3, ["boolean", ["get", "stale"], false], 3, 1.5],
    },
  });
}

function addLineLayers(map: MlMap) {
  // Alambrado: blanco punteado · camino: arena continuo · cañería: celeste con puntos · curso de agua: celeste continuo
  // (el trazo punteado no admite valores por elemento, por eso una capa por tipo)
  for (const [kind, color, width, dash] of [
    ["fence", "#ffffff", 2, [4, 3]],
    ["road", "#C9C46A", 3, undefined],
    ["pipe", BRAND.cielo, 2.5, [0.5, 2]],
    ["stream", BRAND.cielo, 3.5, undefined],
  ] as const) {
    map.addLayer({
      id: `lines-${kind}`,
      type: "line",
      source: "lines",
      filter: ["==", ["get", "kind"], kind],
      layout: { "line-cap": dash ? "butt" : "round" },
      paint: { "line-color": color, "line-width": width, ...(dash ? { "line-dasharray": [...dash] } : {}) },
    });
  }
}

function addHeatLayer(map: MlMap) {
  map.addLayer(
    {
      id: "heat",
      type: "heatmap",
      source: "heat",
      paint: {
        "heatmap-weight": 0.35,
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 18, 1.6],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 6, 14, 14, 18, 30],
        "heatmap-opacity": 0.85,
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(141,179,199,0)",
          0.25,
          BRAND.cielo,
          0.55,
          BRAND.soja,
          0.8,
          BRAND.trigo,
          1,
          BRAND.lino,
        ],
      },
    },
    "plots-fill",
  );
}

function addProblemLayers(map: MlMap) {
  map.addLayer({
    id: "problems-fill",
    type: "fill",
    source: "problems",
    paint: { "fill-color": BRAND.alerta, "fill-opacity": 0.18 },
  });
  map.addLayer({
    id: "problems-line",
    type: "line",
    source: "problems",
    paint: { "line-color": BRAND.alerta, "line-width": 2, "line-dasharray": [2, 2] },
  });
}

function addPoiLayers(map: MlMap) {
  map.addLayer({
    id: "pois",
    type: "circle",
    source: "pois",
    paint: {
      "circle-radius": 13,
      "circle-color": BRAND.cielo,
      "circle-stroke-color": BRAND.surco,
      "circle-stroke-width": 2,
    },
  });
  // El ícono del tipo va sobre el punto; mientras se rasteriza queda el disco.
  map.addLayer({
    id: "pois-icon",
    type: "symbol",
    source: "pois",
    layout: { "icon-image": ["concat", "poi-", ["get", "kind"]], "icon-allow-overlap": true },
  });
  void addPoiImages(map);
}

function addClusterLayers(map: MlMap) {
    map.addLayer({
      id: "points-cluster",
      type: "circle",
      source: "points",
      filter: ["has", "point_count"],
      paint: {
        "circle-radius": ["step", ["get", "point_count"], 13, 10, 17, 30, 21],
        "circle-color": BRAND.lino,
        "circle-stroke-color": BRAND.surco,
        "circle-stroke-width": 2,
      },
    });
    const counts = new Map<number, maplibregl.Marker>();
    const showCounts = () => {
      if (!map.getSource("points") || !map.isSourceLoaded("points")) return;
      const seen = new Set<number>();
      for (const f of map.querySourceFeatures("points", { filter: ["has", "point_count"] })) {
        const id = f.properties?.cluster_id as number;
        if (seen.has(id)) continue;
        seen.add(id);
        const at = (f.geometry as Point).coordinates as [number, number];
        let m = counts.get(id);
        if (!m) {
          const el = document.createElement("div");
          el.className = "pointer-events-none text-xs font-semibold text-surco";
          el.textContent = String(f.properties?.point_count);
          m = new maplibregl.Marker({ element: el }).setLngLat(at).addTo(map);
          counts.set(id, m);
        }
      }
      for (const [id, m] of counts)
        if (!seen.has(id)) {
          m.remove();
          counts.delete(id);
        }
    };
    map.on("render", showCounts);
    map.on("click", "points-cluster", (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const src = map.getSource("points") as GeoJSONSource;
      void src.getClusterExpansionZoom(f.properties?.cluster_id as number).then((zoom) =>
        map.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom: zoom + 0.5 }),
      );
    });
    map.on("mouseenter", "points-cluster", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "points-cluster", () => (map.getCanvas().style.cursor = ""));
}

function addPointLayers(map: MlMap, clusterPoints: boolean | undefined) {
  map.addLayer({
    id: "points",
    type: "circle",
    source: "points",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["coalesce", ["get", "radius"], 6],
      "circle-color": ["coalesce", ["get", "color"], BRAND.trigo],
      "circle-stroke-color": BRAND.lino,
      "circle-stroke-width": 1.5,
    },
  });
  if (clusterPoints) addClusterLayers(map);
}

function addMeasureLayers(map: MlMap) {
  map.addLayer({
    id: "measure-fill",
    type: "fill",
    source: "measure",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": BRAND.cielo, "fill-opacity": 0.25 },
  });
  map.addLayer({
    id: "measure-line",
    type: "line",
    source: "measure",
    filter: ["!=", ["geometry-type"], "Point"],
    paint: { "line-color": BRAND.cielo, "line-width": 3 },
  });
  map.addLayer({
    id: "measure-points",
    type: "circle",
    source: "measure",
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 5,
      "circle-color": BRAND.lino,
      "circle-stroke-color": BRAND.cielo,
      "circle-stroke-width": 2.5,
    },
  });
}

/** Orden de agregado = orden de apilado (z-index) de las capas del mapa. */
export function addLayers(map: MlMap, clusterPoints: boolean | undefined) {
  addOutlineAndPlotLayers(map);
  addLineLayers(map);
  addHeatLayer(map);
  addProblemLayers(map);
  addPoiLayers(map);
  addPointLayers(map, clusterPoints);
  addMeasureLayers(map);
}
