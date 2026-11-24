import { useEffect, useState } from "react";
import type { LineString, MultiPolygon, Polygon } from "geojson";

/** Estado de las herramientas de edición del mapa: dibujar, importar, POI, dividir, unir, vértices y líneas. */
export function useFarmEditing() {
  const [mode, setMode] = useState<"none" | "draw" | "poi" | "import">("none");
  // Dividir (dibuja una línea sobre el lote) y unir (se elige el lote contiguo en el mapa)
  const [splitting, setSplitting] = useState<string | null>(null);
  const [splitLine, setSplitLine] = useState<LineString | null>(null);
  const [mergeFrom, setMergeFrom] = useState<string | null>(null);
  const [mergeWith, setMergeWith] = useState<string | null>(null);
  // Trazar alambrados, caminos y cañerías
  const [lineDraw, setLineDraw] = useState(false);
  const [newLine, setNewLine] = useState<LineString | null>(null);
  // Edición de vértices de un lote existente
  const [shapeEdit, setShapeEdit] = useState<{ id: string; geometry: string } | null>(null);
  const [shape, setShape] = useState<Polygon | MultiPolygon | null>(null);
  const endShapeEdit = () => {
    setShapeEdit(null);
    setShape(null);
  };
  useEffect(() => {
    if (!shapeEdit) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && endShapeEdit();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shapeEdit]);
  const [drawn, setDrawn] = useState<Polygon | null>(null);
  const [poiAt, setPoiAt] = useState<[number, number] | null>(null);
  const [poiQr, setPoiQr] = useState(false);
  return {
    mode, setMode,
    splitting, setSplitting, splitLine, setSplitLine,
    mergeFrom, setMergeFrom, mergeWith, setMergeWith,
    lineDraw, setLineDraw, newLine, setNewLine,
    shapeEdit, setShapeEdit, shape, setShape, endShapeEdit,
    drawn, setDrawn, poiAt, setPoiAt, poiQr, setPoiQr,
  };
}
/** Resultado de `useFarmEditing`. */
export type FarmEditing = ReturnType<typeof useFarmEditing>;

/** Lotes marcados en el mapa para una tarea nueva; `picking` esconde el diálogo mientras se elige. */
export function useTaskPicking(tab: string) {
  const [taskPlots, setTaskPlots] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const togglePicked = (id: string) =>
    setTaskPlots((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  // Al salir de Tareas el diálogo se cierra: la selección del mapa no queda colgada.
  useEffect(() => {
    if (tab !== "tasks") {
      setPicking(false);
      setTaskPlots([]);
    }
  }, [tab]);
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPicking(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking]);
  return { taskPlots, setTaskPlots, picking, setPicking, togglePicked };
}
/** Resultado de `useTaskPicking`. */
export type TaskPicking = ReturnType<typeof useTaskPicking>;
