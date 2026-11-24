/** Límites administrativos y capas propias activas con su opacidad. */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ActiveLayers } from "../../components/CustomLayersControl";
import { useBoundaries, type BoundaryLevel } from "../../lib/boundaries";
import { useCustomLayerImages, useCustomLayers } from "../../lib/customLayers";
import { PEST_WINDOW_MS, pestPoints } from "../../lib/pests";
import { fetchAllRecords } from "../../lib/queries";
import { heatPoints, summarizeTracks, TRACK_WINDOW_MS } from "../../lib/trackHeat";
import type { FarmDetail } from "../../lib/types";

/** Límites administrativos y capas propias activas con su opacidad. */
export function useFarmOverlays(farmId: string, canSeeCustom: boolean, tilesBaseUrl: string | undefined) {
  const [boundaryLevel, setBoundaryLevel] = useState<BoundaryLevel | null>(null);
  const customLayers = useCustomLayers(farmId, canSeeCustom);
  const [customActive, setCustomActive] = useState<ActiveLayers>({});
  const customUrls = useCustomLayerImages(Object.keys(customActive));
  const customImages = (customLayers.data ?? []).flatMap((l) =>
    l.id in customActive && l.corners && customUrls[l.id]
      ? [{ id: l.id, url: customUrls[l.id]!, corners: l.corners, opacity: customActive[l.id]! }]
      : [],
  );
  const boundaries = useBoundaries(boundaryLevel, tilesBaseUrl);
  return { boundaryLevel, setBoundaryLevel, customLayers, customActive, setCustomActive, customImages, boundaries };
}
/** Resultado de `useFarmOverlays`. */
export type FarmOverlays = ReturnType<typeof useFarmOverlays>;

/** Focos de plaga de los últimos 30 días sobre el mapa. */
export function useFarmPests(farmId: string, plots: FarmDetail["plots"] | undefined) {
  const [show, setShow] = useState(false);
  const query = useQuery({
    enabled: show,
    queryKey: ["pests30", farmId],
    queryFn: () => fetchAllRecords({ farmId, kind: "pest", from: Date.now() - PEST_WINDOW_MS }, 1000),
  });
  const points = useMemo(
    () => (show && query.data && plots ? pestPoints(query.data, plots) : []),
    [show, query.data, plots],
  );
  return { show, toggle: () => setShow(!show), isLoading: query.isLoading, points };
}

/** Recorridas grabadas en el celular, como mapa de calor de los últimos 30 días. */
export function useFarmTracks(farmId: string, plots: FarmDetail["plots"] | undefined) {
  const [show, setShow] = useState(false);
  const query = useQuery({
    enabled: show,
    queryKey: ["tracks30", farmId],
    queryFn: () => fetchAllRecords({ farmId, kind: "track", from: Date.now() - TRACK_WINDOW_MS }, 1000),
  });
  const heat = useMemo(() => (show && query.data ? heatPoints(query.data) : []), [show, query.data]);
  const summary = useMemo(
    () => (show && query.data && plots ? summarizeTracks(query.data, plots.map((p) => p.id)) : null),
    [show, query.data, plots],
  );
  return { show, toggle: () => setShow(!show), isLoading: query.isLoading, heat, summary };
}
