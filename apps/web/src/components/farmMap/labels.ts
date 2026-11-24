import * as maplibregl from "maplibre-gl";
import type { Map as MlMap } from "maplibre-gl";
import { placeLabels } from "../../lib/labelLayout";
import { labelPoint } from "./geo";
import type { FarmMapProps } from "./types";

/** Corre u oculta cada nombre de lote para que no quede debajo de un ícono ni de otro nombre. */
export function layoutLabels(map: MlMap, markers: maplibregl.Marker[], p: FarmMapProps) {
  const obstacles = [
    ...(p.pois ?? []).map((o) => ({ ...map.project([o.lon, o.lat]), r: 14 })),
    ...(p.points ?? []).slice(0, 300).map((o) => ({ ...map.project([o.lon, o.lat]), r: (o.radius ?? 6) + 1 })),
  ].map((o) => ({ x: o.x, y: o.y, r: o.r }));
  const boxes = markers.map((m) => {
    const el = m.getElement();
    const c = map.project(m.getLngLat());
    return { x: c.x, y: c.y, w: el.offsetWidth, h: el.offsetHeight };
  });
  placeLabels(boxes, obstacles).forEach((pl, i) => {
    markers[i]!.setOffset([pl.dx, pl.dy]);
    markers[i]!.getElement().style.visibility = pl.hidden ? "hidden" : "";
  });
  }


/** Nombres sobre el mapa (marcadores HTML: no dependen de un servidor de fuentes). */
export function rebuildLabels(map: MlMap, old: maplibregl.Marker[], p: FarmMapProps): maplibregl.Marker[] {
  for (const m of old) m.remove();
  const plotsShown = (p.plots ?? []).filter((pl) => pl.id !== p.editPlot?.id);
  const labels = [
    ...plotsShown.map((pl) => ({ name: pl.name, geometry: pl.geometry })),
    ...(p.farms ?? []).map((f) => ({ name: f.name, geometry: f.geometry })),
  ];
  return labels.map(({ name, geometry }) => {
    const el = document.createElement("div");
    el.className = "plot-label";
    el.textContent = name;
    return new maplibregl.Marker({ element: el }).setLngLat(labelPoint(JSON.parse(geometry))).addTo(map);
  });
}
