/**
 * Mapa de MapLibre: fondo satelital propio (PMTiles en R2), capa NDVI, lotes, puntos de interés,
 * registros y dibujo de polígonos con terra-draw.
 */
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { TerraDraw, TerraDrawPolygonMode } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import { BRAND } from "@yvy/shared";
import { t } from "../lib/i18n";
import type { Layer, Plot, Poi } from "../lib/types";

let protocolAdded = false;
function ensureProtocol() {
  if (protocolAdded) return;
  maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  protocolAdded = true;
}

const DEV_BASEMAP = import.meta.env.DEV || import.meta.env.VITE_DEV_BASEMAP === "1";
const PARAGUAY: [number, number, number, number] = [-62.7, -27.7, -54.2, -19.2];

export interface MapPoint {
  id: string;
  lon: number;
  lat: number;
  label?: string;
  color?: string;
}

export interface FarmMapProps {
  outline?: string | null; // GeoJSON de la estancia
  plots?: Plot[];
  pois?: Poi[];
  points?: MapPoint[];
  layers?: Layer[];
  tilesBaseUrl?: string;
  showNdvi?: boolean;
  selectedPlotId?: string | null;
  bounds?: [number, number, number, number] | null;
  drawing?: boolean;
  onDrawn?: (g: Polygon) => void;
  onPlotClick?: (id: string) => void;
  onPointClick?: (id: string) => void;
  onMapClick?: (lon: number, lat: number) => void;
  className?: string;
}

const fc = (features: Feature[]): FeatureCollection => ({ type: "FeatureCollection", features });

export function FarmMap(props: FarmMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const cb = useRef(props);
  cb.current = props;

  // ---- crear el mapa una vez ----
  useEffect(() => {
    ensureProtocol();
    const map = new maplibregl.Map({
      container: ref.current!,
      style: {
        version: 8,
        sources: DEV_BASEMAP
          ? {
              esri: {
                type: "raster",
                tiles: [
                  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                ],
                tileSize: 256,
                attribution: t("attribution.esriDev"),
                maxzoom: 18,
              },
            }
          : {},
        layers: [
          { id: "bg", type: "background", paint: { "background-color": BRAND.surco } },
          ...(DEV_BASEMAP ? [{ id: "esri", type: "raster" as const, source: "esri" }] : []),
        ],
      },
      bounds: props.bounds ?? PARAGUAY,
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("outline", { type: "geojson", data: fc([]) });
      map.addSource("plots", { type: "geojson", data: fc([]) });
      map.addSource("pois", { type: "geojson", data: fc([]) });
      map.addSource("points", { type: "geojson", data: fc([]) });
      map.addLayer({
        id: "outline",
        type: "line",
        source: "outline",
        paint: { "line-color": BRAND.lino, "line-width": 2.5 },
      });
      map.addLayer({
        id: "plots-fill",
        type: "fill",
        source: "plots",
        paint: {
          "fill-color": ["coalesce", ["get", "color"], ["match", ["get", "kind"], "pasture", BRAND.trigo, BRAND.soja]],
          "fill-opacity": ["case", ["boolean", ["get", "selected"], false], 0.45, 0.18],
        },
      });
      map.addLayer({
        id: "plots-line",
        type: "line",
        source: "plots",
        paint: {
          "line-color": ["case", ["boolean", ["get", "selected"], false], BRAND.lino, BRAND.soja],
          "line-width": ["case", ["boolean", ["get", "selected"], false], 3, 1.5],
        },
      });
      map.addLayer({
        id: "pois",
        type: "circle",
        source: "pois",
        paint: {
          "circle-radius": 6,
          "circle-color": BRAND.cielo,
          "circle-stroke-color": BRAND.surco,
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "points",
        type: "circle",
        source: "points",
        paint: {
          "circle-radius": 6,
          "circle-color": ["coalesce", ["get", "color"], BRAND.trigo],
          "circle-stroke-color": BRAND.lino,
          "circle-stroke-width": 1.5,
        },
      });
      map.on("click", "plots-fill", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id && !cb.current.drawing) cb.current.onPlotClick?.(id);
      });
      map.on("click", "points", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) cb.current.onPointClick?.(id);
      });
      map.on("click", (e: MapMouseEvent) => {
        if (!cb.current.drawing) cb.current.onMapClick?.(e.lngLat.lng, e.lngLat.lat);
      });
      for (const l of ["plots-fill", "points"]) {
        map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
      }
      mapRef.current = map;
      sync();
    });
    return () => {
      drawRef.current?.stop();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ---- actualizar datos ----
  const sync = () => {
    const map = mapRef.current;
    if (!map) return;
    const p = cb.current;
    (map.getSource("outline") as GeoJSONSource).setData(
      fc(p.outline ? [{ type: "Feature", properties: {}, geometry: JSON.parse(p.outline) }] : []),
    );
    (map.getSource("plots") as GeoJSONSource).setData(
      fc(
        (p.plots ?? []).map((pl) => ({
          type: "Feature",
          properties: {
            id: pl.id,
            name: pl.name,
            kind: pl.kind,
            color: pl.color,
            selected: pl.id === p.selectedPlotId,
          },
          geometry: JSON.parse(pl.geometry),
        })),
      ),
    );
    (map.getSource("pois") as GeoJSONSource).setData(
      fc(
        (p.pois ?? []).map((x) => ({
          type: "Feature",
          properties: { id: x.id, name: x.name },
          geometry: { type: "Point", coordinates: [x.lon, x.lat] },
        })),
      ),
    );
    (map.getSource("points") as GeoJSONSource).setData(
      fc(
        (p.points ?? []).map((x) => ({
          type: "Feature",
          properties: { id: x.id, color: x.color },
          geometry: { type: "Point", coordinates: [x.lon, x.lat] },
        })),
      ),
    );
    syncRasters(map, p);
  };

  useEffect(sync, [
    props.outline,
    props.plots,
    props.pois,
    props.points,
    props.selectedPlotId,
    props.layers,
    props.showNdvi,
    props.tilesBaseUrl,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && props.bounds) map.fitBounds(props.bounds, { padding: 40, duration: 600 });
  }, [props.bounds?.join(",")]);

  // ---- dibujo ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (props.drawing) {
      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [new TerraDrawPolygonMode()],
      });
      draw.start();
      draw.setMode("polygon");
      draw.on("finish", (id) => {
        const f = draw.getSnapshot().find((x) => x.id === id);
        if (f && f.geometry.type === "Polygon") cb.current.onDrawn?.(f.geometry as Polygon);
        draw.clear();
      });
      drawRef.current = draw;
    }
    return () => {
      drawRef.current?.stop();
      drawRef.current = null;
    };
  }, [props.drawing, mapRef.current]);

  return <div ref={ref} className={props.className ?? "h-full w-full"} data-testid="map" />;
}

function syncRasters(map: MlMap, p: FarmMapProps) {
  const latest = (layer: Layer["layer"]) =>
    (p.layers ?? []).filter((l) => l.layer === layer).sort((a, b) => b.acquiredAt - a.acquiredAt)[0];
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
  set("basemap", latest("true_color"), true, "outline");
  set("ndvi", latest("ndvi"), !!p.showNdvi, "outline");
}

export const boundsOf = (o: {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}): [number, number, number, number] => [o.minLon, o.minLat, o.maxLon, o.maxLat];
