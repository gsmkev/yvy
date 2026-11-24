import { useEffect, useState } from "react";
import type { LonLat } from "../../lib/measure";

/** Medir: puntos marcados, forma cerrada; Esc termina. */
export function useMeasure() {
  const [measuring, setMeasuring] = useState(false);
  const [points, setPoints] = useState<LonLat[]>([]);
  const [closed, setClosed] = useState(false);
  const end = () => {
    setMeasuring(false);
    setPoints([]);
    setClosed(false);
  };
  useEffect(() => {
    if (!measuring) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && end();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [measuring]);
  const undo = () => {
    setClosed(false);
    setPoints((ps) => ps.slice(0, -1));
  };
  return {
    measuring,
    points,
    closed,
    end,
    undo,
    toggle: () => (measuring ? end() : setMeasuring(true)),
    addPoint: (lon: number, lat: number) => setPoints((ps) => [...ps, [lon, lat]]),
    close: () => setClosed(true),
  };
}
/** Resultado de `useMeasure`. */
export type Measure = ReturnType<typeof useMeasure>;
