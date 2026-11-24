import { BoundariesControl } from "../../components/BoundariesControl";
import { CustomLayersControl } from "../../components/CustomLayersControl";
import { boundsOf } from "../../components/FarmMap";
import { LayersPanel, PanelSection } from "../../components/MapTools";
import { t } from "../../lib/i18n";
import type { FarmDetail, Me } from "../../lib/types";
import { BackgroundSection } from "./BackgroundSection";
import { PestsSection } from "./PestsSection";
import { TracksSection } from "./TracksSection";
import type { FarmOverlays, useFarmPests, useFarmTracks } from "./useFarmOverlays";
import type { FarmScene } from "./useFarmScene";

/** Panel de capas del mapa: fondo, límites, capas propias, plagas y recorridas. */
export function LayersContent({
  d,
  farmId,
  me,
  scene,
  overlays,
  pests,
  tracks,
  onSelectPlot,
}: {
  d: FarmDetail;
  farmId: string;
  me: Me | undefined;
  scene: FarmScene;
  overlays: FarmOverlays;
  pests: ReturnType<typeof useFarmPests>;
  tracks: ReturnType<typeof useFarmTracks>;
  onSelectPlot: (id: string) => void;
}) {
  const { boundaryLevel, boundaries, customLayers } = overlays;
  const canManage = !!me && ["owner", "admin", "agronomist"].includes(me.role);
  return (
    <LayersPanel>
      <BackgroundSection d={d} scene={scene} tilesBaseUrl={me?.tilesBaseUrl} />
      <PanelSection title={t("ui.layer.boundaries")} defaultOpen={false}>
        <BoundariesControl
          level={boundaryLevel}
          onLevel={overlays.setBoundaryLevel}
          loading={!!boundaryLevel && boundaries.isLoading}
          missing={!!boundaryLevel && boundaries.isFetched && !boundaries.data}
        />
      </PanelSection>
      {((customLayers.data?.length ?? 0) > 0 || canManage) && (
        <PanelSection title={t("ui.custom.layersTitle")} defaultOpen={false}>
          <CustomLayersControl
            farmId={farmId}
            layers={customLayers.data ?? []}
            active={overlays.customActive}
            onActive={overlays.setCustomActive}
            canManage={canManage}
            farmBounds={boundsOf(d.farm)}
          />
        </PanelSection>
      )}
      <PestsSection pests={pests} plots={d.plots} onSelect={onSelectPlot} />
      <TracksSection tracks={tracks} plots={d.plots} />
    </LayersPanel>
  );
}
