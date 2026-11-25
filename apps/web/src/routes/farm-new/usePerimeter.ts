/** Perímetro de la estancia nueva: figuras dibujadas o importadas y los lotes que vienen en el archivo. */
import { useMemo, useState } from "react";
import { LIMITS } from "@yvy/shared";
import { combineAreas, parseFile, type ImportedPolygon } from "../../lib/importGeo";
import { t } from "../../lib/i18n";
import type { Area } from "../../lib/types";

/** Estado y acciones del perímetro: `onFile` lee un archivo y `error` guarda lo que falló al leerlo. */
export function usePerimeter() {
  // Partes del perímetro: varias figuras forman un MultiPolygon (cascos separados).
  const [parts, setParts] = useState<Area[]>([]);
  const geometry = useMemo(() => combineAreas(parts), [parts]);
  const [fileOptions, setFileOptions] = useState<ImportedPolygon[] | null>(null);
  // Los demás polígonos del archivo, para importarlos como lotes en el mismo paso.
  const [withPlots, setWithPlots] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const filePlots = (fileOptions ?? [])
    .slice(1)
    .filter((p) => p.areaHa >= LIMITS.geometry.minPlotHa && parts.length === 1 && parts[0] === fileOptions![0]!.geometry);

  const onFile = async (file: File) => {
    setError(null);
    try {
      const polys = (await parseFile(file)).filter((p) => !p.error).sort((a, b) => b.areaHa - a.areaHa);
      if (!polys.length) throw new Error(t("ui.import.errors", { count: 1 }));
      // Varios polígonos: el más grande como perímetro, o todos como partes de la estancia.
      setParts([polys[0]!.geometry]);
      setFileOptions(polys.length === 1 ? null : polys);
    } catch (e) {
      setError(e);
    }
  };
  const addPart = (g: Area) => {
    setParts((prev) => [...prev, g]);
    setFileOptions(null);
  };
  const reset = () => {
    setParts([]);
    setFileOptions(null);
  };
  return { parts, setParts, geometry, fileOptions, withPlots, setWithPlots, filePlots, error, setError, onFile, addPart, reset };
}
