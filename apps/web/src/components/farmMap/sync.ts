/** Vuelca las props del mapa a sus fuentes GeoJSON, rasters y marcadores de nombres. */
import type { GeoJSONSource, Map as MlMap, Marker } from "maplibre-gl";
import { fc } from "./geo";
import { layoutLabels, rebuildLabels } from "./labels";
import { syncBoundaries, syncCustomImages, syncRasters } from "./rasters";
import type { FarmMapProps } from "./types";

const setData = (map: MlMap, source: string, features: Parameters<typeof fc>[0]) =>
  (map.getSource(source) as GeoJSONSource).setData(fc(features));

const pointFeature = (coordinates: [number, number], properties: Record<string, unknown> = {}) => ({
  type: "Feature" as const,
  properties,
  geometry: { type: "Point" as const, coordinates },
});

function syncOutline(map: MlMap, p: FarmMapProps) {
  setData(map, "outline", [
    ...(p.outline ? [{ type: "Feature" as const, properties: {}, geometry: JSON.parse(p.outline) }] : []),
    ...(p.farms ?? []).map((f) => ({
      type: "Feature" as const,
      properties: { id: f.id, alert: !!f.alert },
      geometry: JSON.parse(f.geometry),
    })),
  ]);
}

function syncPlotsAndLines(map: MlMap, p: FarmMapProps, plotsShown: NonNullable<FarmMapProps["plots"]>) {
  setData(
    map,
    "plots",
    plotsShown.map((pl) => ({
      type: "Feature",
      properties: {
        id: pl.id,
        name: pl.name,
        kind: pl.kind,
        color: pl.color,
        selected: pl.id === p.selectedPlotId || !!p.pickedPlotIds?.includes(pl.id),
        stale: !!p.stalePlotIds?.includes(pl.id),
      },
      geometry: JSON.parse(pl.geometry),
    })),
  );
  setData(
    map,
    "lines",
    (p.lines ?? []).map((l) => ({
      type: "Feature",
      properties: { id: l.id, kind: l.kind },
      geometry: JSON.parse(l.geometry),
    })),
  );
  setData(
    map,
    "problems",
    (p.problemAreas ?? []).map((a) => ({ type: "Feature", properties: { id: a.id }, geometry: JSON.parse(a.geometry) })),
  );
}

function syncPoints(map: MlMap, p: FarmMapProps) {
  setData(
    map,
    "pois",
    (p.pois ?? []).map((x) => ({
      type: "Feature",
      properties: { id: x.id, name: x.name, kind: x.kind },
      geometry: { type: "Point", coordinates: [x.lon, x.lat] },
    })),
  );
  setData(
    map,
    "points",
    (p.points ?? []).map((x) => ({
      type: "Feature",
      properties: { id: x.id, color: x.color, radius: x.radius },
      geometry: { type: "Point", coordinates: [x.lon, x.lat] },
    })),
  );
  setData(map, "heat", (p.heat ?? []).map((c) => pointFeature(c)));
}

function syncMeasure(map: MlMap, p: FarmMapProps) {
  const mp = p.measurePoints ?? [];
  setData(map, "measure", [
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
    ...mp.map((c) => pointFeature(c)),
  ]);
  map.getCanvas().style.cursor = p.measuring ? "crosshair" : "";
}

/** Vuelca las props al mapa (fuentes GeoJSON, rasters y nombres); devuelve los marcadores de nombres nuevos. */
export function syncMap(map: MlMap, p: FarmMapProps, labels: Marker[]): Marker[] {
  syncOutline(map, p);
  syncBoundaries(map, p.boundaries ?? null);
  syncCustomImages(map, p.customImages ?? []);
  const next = rebuildLabels(map, labels, p);
  layoutLabels(map, next, p);
  syncPlotsAndLines(map, p, (p.plots ?? []).filter((pl) => pl.id !== p.editPlot?.id));
  syncPoints(map, p);
  syncMeasure(map, p);
  syncRasters(map, p);
  return next;
}
