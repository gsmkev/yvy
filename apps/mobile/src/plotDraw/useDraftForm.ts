/** Estado del formulario del lote que se dibuja (nombre, tipo y cultivo). */
import { useEffect, useRef, useState, type RefObject } from "react";
import type { CameraRef } from "@maplibre/maplibre-react-native";
import type { CROPS, PLOT_KINDS } from "@yvy/shared";
import type { Plot } from "../db/store";
import type { V } from "../lib/plotDraft";

/** Nombre, tipo y cultivo del lote; al editar se cargan del lote (que llega de la base local un instante después de abrir). */
export function useDraftForm(editing: Plot | undefined, initial: V[] | null, setVs: (vs: V[]) => void, camera: RefObject<CameraRef | null>) {
  const start = { name: editing?.name ?? "", kind: editing?.kind ?? "crop", crop: editing?.crop ?? null };
  const [name, setName] = useState(start.name);
  const [kind, setKind] = useState<(typeof PLOT_KINDS)[number]>(start.kind);
  const [crop, setCrop] = useState<(typeof CROPS)[number] | null>(start.crop);
  const seeded = useRef(false);
  useEffect(() => {
    if (editing && !seeded.current) {
      seeded.current = true;
      setVs(initial ?? []);
      setName(editing.name);
      setKind(editing.kind);
      setCrop(editing.crop ?? null);
      camera.current?.fitBounds([editing.minLon, editing.minLat, editing.maxLon, editing.maxLat], { padding: { top: 60, bottom: 220, left: 60, right: 60 }, duration: 0 });
    }
  }, [editing?.id]);
  return { name, setName, kind, setKind, crop, setCrop };
}
