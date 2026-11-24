import { useState } from "react";
import { defaultCompare, pickLayer, type Camera } from "../../lib/scenes";
import { loadPrefs, savePrefs } from "../../lib/prefs";
import type { Layer } from "../../lib/types";
import type { Overlay } from "./overlays";

/** Capa de fondo (satélite o vigor), índice elegido, fechas por tipo y comparación con cortina. */
export function useFarmScene(layers: Layer[] | undefined) {
  const [wantedLayer, setWantedLayer] = useState<"satellite" | "ndvi">(() =>
    loadPrefs().layer === "ndvi" ? "ndvi" : "satellite",
  );
  const [pickedIds, setPickedIds] = useState<Partial<Record<Layer["layer"], string>>>({});
  const [indexKind, setIndexKind] = useState<Overlay>("ndvi");
  const [compare, setCompare] = useState<{ left: string; right: string } | null>(null);
  const [curtain, setCurtain] = useState(50);
  const [camera, setCamera] = useState<Camera | null>(null);

  const all = layers ?? [];
  const hasIndex = (k: Overlay) => all.some((l) => l.layer === k);
  // Si el índice elegido no tiene imagen en esta estancia, vuelve a NDVI
  const shownIndex: Overlay = hasIndex(indexKind) ? indexKind : "ndvi";
  const ndviLayer = all.filter((l) => l.layer === shownIndex).sort((a, b) => b.acquiredAt - a.acquiredAt)[0];
  // La capa de vigor recordada solo vale si esta estancia tiene imagen
  const layer = wantedLayer === "ndvi" && ndviLayer ? "ndvi" : "satellite";
  const kind: Layer["layer"] = layer === "ndvi" ? shownIndex : "true_color";
  return {
    layer, kind, shownIndex, ndviLayer, hasIndex,
    hasBasemap: all.some((l) => l.layer === "true_color"),
    pickedIds, compare, setCompare, curtain, setCurtain, camera, setCamera,
    pickBackground: (l: "satellite" | "ndvi") => {
      setWantedLayer(l);
      setCompare(null);
      savePrefs({ layer: l });
    },
    pickIndex: (k: Overlay) => {
      setIndexKind(k);
      setCompare(null);
    },
    pickScene: (id: string) => setPickedIds((p) => ({ ...p, [kind]: id })),
    pickedFor: (k: Layer["layer"]) => pickLayer(all, k, pickedIds[k]),
    toggleCompare: () => {
      if (compare) return setCompare(null);
      setCurtain(50);
      setCompare(defaultCompare(all, kind));
    },
  };
}
/** Resultado de `useFarmScene`. */
export type FarmScene = ReturnType<typeof useFarmScene>;
