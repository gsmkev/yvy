import { useEffect, type MutableRefObject } from "react";
import type { Map as MlMap } from "maplibre-gl";
import type { LineString, MultiPolygon, Polygon } from "geojson";
import { TerraDraw, TerraDrawLineStringMode, TerraDrawPolygonMode, TerraDrawSelectMode } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { FarmMapProps } from "./types";

interface DrawCtx {
  props: FarmMapProps;
  mapRef: MutableRefObject<MlMap | null>;
  cb: MutableRefObject<FarmMapProps>;
  drawRef: MutableRefObject<TerraDraw | null>;
  editRef: MutableRefObject<TerraDraw | null>;
}

/** Dibujo de un polígono nuevo. */
export function useDrawPolygon({ props, mapRef, cb, drawRef }: DrawCtx) {
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
}

/** Dibujo de líneas (M-05, M-20). */
export function useDrawLine({ props, mapRef, cb }: DrawCtx) {
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
}

/** Edición de vértices (M-02). */
export function useEditPlot({ props, mapRef, cb, editRef }: DrawCtx) {
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
}
