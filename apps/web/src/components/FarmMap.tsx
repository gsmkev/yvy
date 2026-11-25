/**
 * Mapa de MapLibre: fondo satelital propio (PMTiles en R2), capa NDVI, lotes, puntos de interés,
 * registros y dibujo de polígonos con terra-draw. Las capas, el volcado de datos, los eventos y el
 * dibujo viven en `farmMap/`; acá queda el ciclo de vida del mapa.
 */
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import type { TerraDraw } from "terra-draw";
import { t } from "../lib/i18n";
import { cameraDiffers, type Camera } from "../lib/scenes";
import { useDrawLine, useDrawPolygon, useEditPlot } from "./farmMap/drawing";
import { bindMapEvents, bindSnapshot } from "./farmMap/events";
import { layoutLabels } from "./farmMap/labels";
import { addLayers, addSources } from "./farmMap/layers";
import { DEV_BASEMAP } from "./farmMap/rasters";
import { syncMap } from "./farmMap/sync";
import type { FarmMapProps } from "./farmMap/types";

/** Caja envolvente de una geometría (reexportada de farmMap/geo). */
export { boundsOf } from "./farmMap/geo";
/** Punto del mapa (tipo reexportado). */
export type { MapPoint } from "./farmMap/types";

let protocolAdded = false;
function ensureProtocol() {
  if (protocolAdded) return;
  maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  protocolAdded = true;
}

const PARAGUAY: [number, number, number, number] = [-62.7, -27.7, -54.2, -19.2];

/** Estilo vacío: fondo oscuro y, solo en desarrollo, imagen satelital de Esri. */
const baseStyle = (): maplibregl.StyleSpecification => ({
  version: 8,
  sources: DEV_BASEMAP
    ? {
        esri: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: t("attribution.common.esriDev"),
          maxzoom: 18,
        },
      }
    : {},
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#141a12" } },
    ...(DEV_BASEMAP ? [{ id: "esri", type: "raster" as const, source: "esri" }] : []),
  ],
});

/** Mapa de la estancia con lotes, puntos, capas, dibujo y edición. */
export function FarmMap(props: FarmMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const editRef = useRef<TerraDraw | null>(null);
  const labelsRef = useRef<maplibregl.Marker[]>([]);
  const cb = useRef(props);
  cb.current = props;

  const sync = () => {
    const map = mapRef.current;
    if (map) labelsRef.current = syncMap(map, cb.current, labelsRef.current);
  };

  // ---- crear el mapa una vez ----
  useEffect(() => {
    ensureProtocol();
    const map = new maplibregl.Map({
      container: ref.current!,
      style: baseStyle(),
      bounds: props.bounds ?? PARAGUAY,
      // Sentinel-2 tiene 10 m por píxel y las teselas llegan a z16: más cerca solo se ve borroso
      maxZoom: 17,
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
    });
    if (props.navControl !== false) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    if (props.apiRef) props.apiRef.current = { zoom: (dir) => (dir > 0 ? map.zoomIn() : map.zoomOut()) };
    // Los nombres de los lotes se acomodan al mover o acercar para no pisar los íconos
    map.on("moveend", () => layoutLabels(map, labelsRef.current, cb.current));
    map.on("load", () => {
      addSources(map, cb.current.clusterPoints);
      addLayers(map, cb.current.clusterPoints);
      bindMapEvents(map, cb);
      mapRef.current = map;
      bindSnapshot(map, cb);
      sync();
      if (cb.current.camera) map.jumpTo(cb.current.camera);
      // Los límites que llegaron antes de la carga (registros, lotes) no pasaron por el efecto de abajo
      else if (cb.current.bounds) map.fitBounds(cb.current.bounds, { padding: 60, duration: 0, maxZoom: 16 });
    });
    return () => {
      drawRef.current?.stop();
      map.remove();
      mapRef.current = null;
      if (cb.current.apiRef) cb.current.apiRef.current = null;
    };
  }, []);

  useEffect(sync, [
    props.outline,
    props.farms,
    props.plots,
    props.pois,
    props.lines,
    props.problemAreas,
    props.points,
    props.heat,
    props.selectedPlotId,
    props.pickedPlotIds,
    props.stalePlotIds,
    props.editPlot?.id,
    props.layers,
    props.boundaries,
    props.customImages,
    props.showNdvi,
    props.indexKind,
    props.layerIds,
    props.tilesBaseUrl,
    props.measuring,
    props.measurePoints,
    props.measureClosed,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && props.bounds) map.fitBounds(props.bounds, { padding: 60, duration: 600, maxZoom: 16 });
  }, [props.bounds?.join(",")]);

  useEffect(() => {
    const map = mapRef.current;
    const c = props.camera;
    if (!map || !c) return;
    const now: Camera = {
      center: [map.getCenter().lng, map.getCenter().lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    };
    if (cameraDiffers(now, c)) map.jumpTo(c);
  }, [props.camera]);

  useEffect(() => {
    const map = mapRef.current;
    const f = props.flyTo;
    if (map && f) map.flyTo({ center: [f.lon, f.lat], zoom: f.zoom ?? 14, duration: 800 });
  }, [props.flyTo?.n]);

  const draw = { props, mapRef, cb, drawRef, editRef };
  useDrawPolygon(draw);
  useDrawLine(draw);
  useEditPlot(draw);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={t("ui.map.region")}
      className={props.className ?? "h-full w-full"}
      data-testid="map"
    />
  );
}
