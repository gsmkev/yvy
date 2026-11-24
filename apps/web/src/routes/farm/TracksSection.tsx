import { LayerSwitch, PanelSection } from "../../components/MapTools";
import { t } from "../../lib/i18n";
import type { Plot } from "../../lib/types";
import type { useFarmTracks } from "./useFarmOverlays";

export function TracksSection({ tracks, plots }: { tracks: ReturnType<typeof useFarmTracks>; plots: Plot[] }) {
  const trackSummary = tracks.summary;
  return (
    <PanelSection title={t("app.layerTracks")} defaultOpen={false}>
      <LayerSwitch label={t("app.layerTracks")} on={tracks.show} onToggle={tracks.toggle} />
      {tracks.show && (
        <div className="text-micro">
          <p className="mb-1 font-medium">{t("app.tracksLegendTitle")}</p>
          {tracks.isLoading ? (
            <p className="text-lino/70">{t("ui.loading")}</p>
          ) : !trackSummary || trackSummary.walks === 0 ? (
            <p className="text-lino/70">{t("app.tracksNone")}</p>
          ) : (
            <>
              <p className="num">
                {t(trackSummary.walks === 1 ? "app.tracksSummaryOne" : "app.tracksSummary", {
                  n: trackSummary.walks,
                  km: trackSummary.km.toLocaleString("es-PY", { maximumFractionDigits: 1 }),
                })}
              </p>
              {trackSummary.unvisited.length > 0 && (
                <p className="mt-1 text-lino/70">
                  {t("app.tracksUnvisited", {
                    names: trackSummary.unvisited
                      .map((id) => plots.find((p) => p.id === id)?.name)
                      .filter(Boolean)
                      .join(", "),
                  })}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </PanelSection>
  );
}
