/**
 * Mapa de MapLibre: fondo satelital propio (PMTiles en R2), capa NDVI, lotes, puntos de interés,
 * registros y dibujo de polígonos con terra-draw.
 */
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { TerraDraw, TerraDrawLineStringMode, TerraDrawPolygonMode, TerraDrawSelectMode } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { Feature, FeatureCollection, LineString, MultiPolygon, Polygon } from "geojson";
import { BRAND } from "@yvy/shared";
import pointOnFeature from "@turf/point-on-feature";
import { t } from "../lib/i18n";
import { cameraDiffers, pickLayer, type Camera } from "../lib/scenes";
import type { Layer, Plot, Poi } from "../lib/types";

let protocolAdded = false;
function ensureProtocol() {
  if (protocolAdded) return;
  maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  protocolAdded = true;
}

/** Mapa base de Paraguay en R2 (bucket yvy-tiles), publicado por el job country_basemap. */
export const COUNTRY_BASEMAP = "base/paraguay.pmtiles";
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
  /** Áreas problema del lote (S-08): borde punteado de alerta. */
  problemAreas?: { id: string; geometry: string }[];
  points?: MapPoint[];
  /** Mapa de calor de recorridas (F-06): puntos a lo largo de las recorridas grabadas. */
  heat?: [number, number][];
  /** Varias estancias a la vez (inicio): perímetro, nombre y fondo satelital propio. */
  farms?: { id: string; name: string; geometry: string; basemapPath?: string | null; alert?: boolean }[];
  layers?: Layer[];
  /** M-16: límites administrativos (geoBoundaries); sin datos, la capa no existe. */
  boundaries?: FeatureCollection | null;
  /** M-17: imágenes propias georreferenciadas (url local), de abajo hacia arriba. */
  customImages?: { id: string; url: string; corners: [number, number][]; opacity: number }[];
  tilesBaseUrl?: string;
  showNdvi?: boolean;
  /** S-07: índice que muestra la capa de vigor (NDVI por defecto). */
  indexKind?: Layer["layer"];
  /** Capa elegida por tipo (S-04); si falta, la más nueva. */
  layerIds?: Partial<Record<Layer["layer"], string>>;
  /** Cámara compartida entre dos mapas (comparar con cortina): se aplica al cambiar y se avisa al mover con el mouse. */
  camera?: Camera | null;
  onCamera?: (c: Camera) => void;
  selectedPlotId?: string | null;
  /** Lotes marcados para una tarea (selección múltiple): se dibujan como el lote elegido. */
  pickedPlotIds?: string[];
  bounds?: [number, number, number, number] | null;
  /** Vuela a un punto (cambiar `n` para repetir el mismo destino). */
  flyTo?: { lon: number; lat: number; zoom?: number; n: number } | null;
  drawing?: boolean;
  /** Dibujo de una línea (cortar un lote, trazar un alambrado). Termina con doble toque o Enter. */
  /** M-20: alambrados, caminos y cañerías de la estancia. */
  lines?: { id: string; kind: string; geometry: string }[];
  drawingLine?: boolean;
  onLineDrawn?: (g: LineString) => void;
  /** M-02: lote cuya forma se edita (vértices arrastrables). Se oculta de la capa de lotes mientras tanto. */
  editPlot?: { id: string; geometry: string } | null;
  onEditChange?: (g: Polygon | MultiPolygon) => void;
  onDrawn?: (g: Polygon) => void;
  onPlotClick?: (id: string) => void;
  onPointClick?: (id: string) => void;
  onMapClick?: (lon: number, lat: number) => void;
  /** Herramienta de medir: puntos marcados, forma cerrada y avisos de clic. */
  measuring?: boolean;
  measurePoints?: [number, number][];
  measureClosed?: boolean;
  onMeasureClick?: (lon: number, lat: number) => void;
  /** El clic cayó sobre el primer punto: cierra la forma. */
  onMeasureClose?: () => void;
  className?: string;
  /** U-27: se llena con una función que devuelve la captura del mapa (PNG en data URL) o null si no se puede. */
  snapshotRef?: { current: (() => Promise<string | null>) | null };
}

const fc = (features: Feature[]): FeatureCollection => ({ type: "FeatureCollection", features });

export function FarmMap(props: FarmMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const editRef = useRef<TerraDraw | null>(null);
  const labelsRef = useRef<maplibregl.Marker[]>([]);
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
          { id: "bg", type: "background", paint: { "background-color": "#141a12" } },
          ...(DEV_BASEMAP ? [{ id: "esri", type: "raster" as const, source: "esri" }] : []),
        ],
      },
      bounds: props.bounds ?? PARAGUAY,
      // Sentinel-2 tiene 10 m por píxel y las teselas llegan a z16: más cerca solo se ve borroso
      maxZoom: 17,
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("outline", { type: "geojson", data: fc([]) });
      map.addSource("plots", { type: "geojson", data: fc([]) });
      map.addSource("pois", { type: "geojson", data: fc([]) });
      map.addSource("problems", { type: "geojson", data: fc([]) });
      map.addSource("points", { type: "geojson", data: fc([]) });
      map.addSource("measure", { type: "geojson", data: fc([]) });
      map.addSource("lines", { type: "geojson", data: fc([]) });
      map.addSource("heat", { type: "geojson", data: fc([]) });
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
            ["coalesce", ["get", "color"], "rgba(255,255,255,0.7)"],
          ],
          "line-width": ["case", ["boolean", ["get", "selected"], false], 3, 1.5],
        },
      });
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
      map.on("click", "plots-fill", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id && !cb.current.drawing && !cb.current.drawingLine && !cb.current.measuring) cb.current.onPlotClick?.(id);
      });
      map.on("click", "points", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) cb.current.onPointClick?.(id);
      });
      map.on("click", (e: MapMouseEvent) => {
        const c = cb.current;
        if (c.measuring) {
          const first = c.measurePoints?.[0];
          if (first && !c.measureClosed && (c.measurePoints?.length ?? 0) >= 3) {
            const a = map.project(first);
            if (Math.hypot(a.x - e.point.x, a.y - e.point.y) < 12) return c.onMeasureClose?.();
          }
          if (!c.measureClosed) c.onMeasureClick?.(e.lngLat.lng, e.lngLat.lat);
          return;
        }
        if (!c.drawing && !c.drawingLine) c.onMapClick?.(e.lngLat.lng, e.lngLat.lat);
      });
      for (const l of ["plots-fill", "points"]) {
        map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
      }
      const hoverName = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
      map.on("mousemove", "boundaries-fill", (e: MapLayerMouseEvent) => {
        const name = e.features?.[0]?.properties?.name as string | undefined;
        if (name && !cb.current.drawing && !cb.current.measuring) hoverName.setLngLat(e.lngLat).setText(name).addTo(map);
      });
      map.on("mouseleave", "boundaries-fill", () => hoverName.remove());
      map.on("move", (e) => {
        // Solo lo que mueve la persona: el salto que aplica la cámara del otro mapa no rebota.
        if (!e.originalEvent) return;
        cb.current.onCamera?.({
          center: [map.getCenter().lng, map.getCenter().lat],
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        });
      });
      mapRef.current = map;
      if (cb.current.snapshotRef)
        cb.current.snapshotRef.current = () =>
          new Promise((resolve) => {
            // El lienzo solo se puede leer dentro del cuadro en que se dibuja
            map.once("render", () => {
              try {
                resolve(map.getCanvas().toDataURL("image/png"));
              } catch {
                resolve(null);
              }
            });
            map.triggerRepaint();
          });
      sync();
      if (cb.current.camera) map.jumpTo(cb.current.camera);
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
      fc([
        ...(p.outline ? [{ type: "Feature" as const, properties: {}, geometry: JSON.parse(p.outline) }] : []),
        ...(p.farms ?? []).map((f) => ({
          type: "Feature" as const,
          properties: { id: f.id, alert: !!f.alert },
          geometry: JSON.parse(f.geometry),
        })),
      ]),
    );
    syncBoundaries(map, p.boundaries ?? null);
    syncCustomImages(map, p.customImages ?? []);
    // Nombres sobre el mapa (marcadores HTML: no dependen de un servidor de fuentes)
    for (const m of labelsRef.current) m.remove();
    const plotsShown = (p.plots ?? []).filter((pl) => pl.id !== p.editPlot?.id);
    const labels = [
      ...plotsShown.map((pl) => ({ name: pl.name, geometry: pl.geometry })),
      ...(p.farms ?? []).map((f) => ({ name: f.name, geometry: f.geometry })),
    ];
    labelsRef.current = labels.map(({ name, geometry }) => {
      const el = document.createElement("div");
      el.className = "plot-label";
      el.textContent = name;
      return new maplibregl.Marker({ element: el }).setLngLat(labelPoint(JSON.parse(geometry))).addTo(map);
    });
    (map.getSource("plots") as GeoJSONSource).setData(
      fc(
        plotsShown.map((pl) => ({
          type: "Feature",
          properties: {
            id: pl.id,
            name: pl.name,
            kind: pl.kind,
            color: pl.color,
            selected: pl.id === p.selectedPlotId || !!p.pickedPlotIds?.includes(pl.id),
          },
          geometry: JSON.parse(pl.geometry),
        })),
      ),
    );
    (map.getSource("lines") as GeoJSONSource).setData(
      fc(
        (p.lines ?? []).map((l) => ({
          type: "Feature",
          properties: { id: l.id, kind: l.kind },
          geometry: JSON.parse(l.geometry),
        })),
      ),
    );
    (map.getSource("problems") as GeoJSONSource).setData(
      fc(
        (p.problemAreas ?? []).map((a) => ({
          type: "Feature",
          properties: { id: a.id },
          geometry: JSON.parse(a.geometry),
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
    (map.getSource("heat") as GeoJSONSource).setData(
      fc(
        (p.heat ?? []).map((c) => ({
          type: "Feature" as const,
          properties: {},
          geometry: { type: "Point" as const, coordinates: c },
        })),
      ),
    );
    const mp = p.measurePoints ?? [];
    (map.getSource("measure") as GeoJSONSource).setData(
      fc([
        ...(mp.length > 1
          ? [
              {
                type: "Feature" as const,
                properties: {},
                geometry: p.measureClosed
                  ? { type: "Polygon" as const, coordinates: [[...mp, mp[0]!]] }
                  : { type: "LineString" as const, coordinates: mp },
              },
            ]
          : []),
        ...mp.map((c) => ({
          type: "Feature" as const,
          properties: {},
          geometry: { type: "Point" as const, coordinates: c },
        })),
      ]),
    );
    map.getCanvas().style.cursor = p.measuring ? "crosshair" : "";
    syncRasters(map, p);
  };

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

  // ---- dibujo de líneas (M-05, M-20) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.drawingLine) return;
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [new TerraDrawLineStringMode()],
    });
    draw.start();
    draw.setMode("linestring");
    draw.on("finish", (id) => {
      const f = draw.getSnapshot().find((x) => x.id === id);
      if (f && f.geometry.type === "LineString") cb.current.onLineDrawn?.(f.geometry as LineString);
      draw.clear();
    });
    return () => draw.stop();
  }, [props.drawingLine, mapRef.current]);

  // ---- edición de vértices (M-02) ----
  useEffect(() => {
    const map = mapRef.current;
    const ep = props.editPlot;
    if (!map || !ep) return;
    const geom = JSON.parse(ep.geometry) as Polygon | MultiPolygon;
    const parts: number[][][][] = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [
        new TerraDrawPolygonMode(),
        new TerraDrawSelectMode({
          flags: {
            polygon: {
              feature: {
                draggable: false,
                coordinates: { midpoints: true, draggable: true, deletable: true },
              },
            },
          },
        }),
      ],
    });
    draw.start();
    // terra-draw rechaza coordenadas con más de 9 decimales
    const r9 = (n: number) => Math.round(n * 1e9) / 1e9;
    draw.addFeatures(
      parts.map((rings) => ({
        type: "Feature" as const,
        properties: { mode: "polygon" },
        geometry: { type: "Polygon" as const, coordinates: rings.map((ring) => ring.map((c) => [r9(c[0]!), r9(c[1]!)])) },
      })),
    );
    // M-09: cada parte (casco) es una figura; se informa el conjunto como Polygon o MultiPolygon.
    const ids = draw.getSnapshot().map((x) => x.id!);
    if (!ids.length) {
      draw.stop();
      return;
    }
    draw.setMode("select");
    draw.selectFeature(ids[0]!);
    const report = () => {
      const polys = draw
        .getSnapshot()
        .filter((x) => ids.includes(x.id!) && x.geometry.type === "Polygon")
        .map((x) => (x.geometry as Polygon).coordinates);
      if (polys.length === ids.length)
        cb.current.onEditChange?.(
          polys.length === 1 ? { type: "Polygon", coordinates: polys[0]! } : { type: "MultiPolygon", coordinates: polys },
        );
    };
    draw.on("change", (_ids, type) => {
      if (type === "update" || type === "delete") report();
    });
    // Un clic en el vacío deselecciona; se vuelve a elegir para que los vértices sigan a la vista.
    let current = ids[0]!;
    draw.on("select", (sel) => {
      current = sel;
    });
    draw.on("deselect", () => setTimeout(() => editRef.current === draw && draw.selectFeature(current), 0));
    editRef.current = draw;
    return () => {
      editRef.current = null;
      draw.stop();
    };
  }, [props.editPlot?.id, mapRef.current]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={t("ui.mapRegion")}
      className={props.className ?? "h-full w-full"}
      data-testid="map"
    />
  );
}

/** M-16: la fuente se agrega solo con datos, así la atribución "geoBoundaries" aparece únicamente con la capa activa. */
function syncBoundaries(map: MlMap, data: FeatureCollection | null) {
  const src = map.getSource("boundaries") as GeoJSONSource | undefined;
  if (!data) {
    if (map.getLayer("boundaries-line")) map.removeLayer("boundaries-line");
    if (map.getLayer("boundaries-fill")) map.removeLayer("boundaries-fill");
    if (src) map.removeSource("boundaries");
    return;
  }
  if (src) return src.setData(data);
  map.addSource("boundaries", { type: "geojson", data, attribution: t("attribution.geoBoundaries") });
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
function syncCustomImages(map: MlMap, images: NonNullable<FarmMapProps["customImages"]>) {
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

function syncRasters(map: MlMap, p: FarmMapProps) {
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

export const boundsOf = (o: {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}): [number, number, number, number] => [o.minLon, o.minLat, o.maxLon, o.maxLat];

/** Punto garantizado dentro del polígono (el centro del bbox cae afuera en lotes en L o U). */
function labelPoint(g: Polygon | MultiPolygon): [number, number] {
  return pointOnFeature({ type: "Feature", properties: {}, geometry: g }).geometry.coordinates as [number, number];
}
