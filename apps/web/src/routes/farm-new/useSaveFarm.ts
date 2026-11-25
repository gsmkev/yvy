/** Guardado de la estancia nueva y de los lotes que vienen en el archivo importado. */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { post } from "../../lib/api";
import type { ImportedPolygon } from "../../lib/importGeo";
import type { Area } from "../../lib/types";

/** Datos que se mandan al crear la estancia. */
interface NewFarm {
  name: string;
  department: string;
  district: string;
  geometry: Area | null;
  /** Lotes del archivo, si se eligió importarlos. */
  plots: ImportedPolygon[];
}

/** Crea la estancia (y sus lotes de a 40) y abre su ficha; `onError` recibe lo que falle. */
export function useSaveFarm(onError: (e: unknown) => void) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const save = async (f: NewFarm) => {
    if (!f.geometry) return;
    setBusy(true);
    onError(null);
    try {
      const r = await post<{ id: string }>("/org/farms", {
        name: f.name,
        department: f.department || null,
        district: f.district || null,
        geometry: f.geometry,
      });
      for (let i = 0; i < f.plots.length; i += 40) {
        await post(`/org/farms/${r.id}/plots`, {
          plots: f.plots.slice(i, i + 40).map((p) => ({ name: p.name, kind: "crop", geometry: p.geometry })),
        });
      }
      await qc.invalidateQueries({ queryKey: ["farms"] });
      navigate({ to: "/estancias/$farmId", params: { farmId: r.id } });
    } catch (e) {
      onError(e);
      setBusy(false);
    }
  };
  return { busy, save };
}
