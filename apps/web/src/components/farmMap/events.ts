import * as maplibregl from "maplibre-gl";
import type { Map as MlMap, MapLayerMouseEvent, MapMouseEvent } from "maplibre-gl";
import type { MutableRefObject } from "react";
import type { FarmMapProps } from "./types";

type Cb = MutableRefObject<FarmMapProps>;

function bindClicks(map: MlMap, cb: Cb) {
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
}

function bindBoundaryHover(map: MlMap, cb: Cb) {
  const hoverName = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
  map.on("mousemove", "boundaries-fill", (e: MapLayerMouseEvent) => {
    const name = e.features?.[0]?.properties?.name as string | undefined;
    if (name && !cb.current.drawing && !cb.current.measuring) hoverName.setLngLat(e.lngLat).setText(name).addTo(map);
  });
  map.on("mouseleave", "boundaries-fill", () => hoverName.remove());
}

/** Solo lo que mueve la persona se avisa: el salto que aplica la cámara del otro mapa no rebota. */
function bindCameraEvents(map: MlMap, cb: Cb) {
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
}

/** Clics, hover y cámara compartida del mapa (los datos llegan por `cb`, siempre al día). */
export function bindMapEvents(map: MlMap, cb: Cb) {
  bindClicks(map, cb);
  bindBoundaryHover(map, cb);
  bindCameraEvents(map, cb);
}

/** U-27: deja en `snapshotRef` una función que devuelve la captura del mapa (PNG en data URL) o null. */
export function bindSnapshot(map: MlMap, cb: Cb) {
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
}
