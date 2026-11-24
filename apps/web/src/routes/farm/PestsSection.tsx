import { LayerSwitch, PanelSection } from "../../components/MapTools";
import { PEST_COLORS, pestCounts, pestsByPlot } from "../../lib/pests";
import { t, tk } from "../../lib/i18n";
import type { Plot } from "../../lib/types";
import type { useFarmPests } from "./useFarmOverlays";

export function PestsSection({
  pests,
  plots,
  onSelect,
}: {
  pests: ReturnType<typeof useFarmPests>;
  plots: Plot[];
  onSelect: (id: string) => void;
}) {
  const pestPts = pests.points;
  return (
    <PanelSection title={t("ui.layerPests")} defaultOpen={false}>
      <LayerSwitch label={t("ui.layerPests")} on={pests.show} onToggle={pests.toggle} />
      {pests.show && (
        <div className="text-micro">
          <p className="mb-1 font-medium">{t("ui.pestsLegendTitle")}</p>
          {pests.isLoading ? (
            <p className="text-lino/70">{t("ui.loading")}</p>
          ) : pestPts.length === 0 ? (
            <p className="text-lino/70">{t("ui.pestsNone")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {pestCounts(pestPts).map((c) => (
                <li key={c.pest} className="num flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PEST_COLORS[c.pest] }} aria-hidden />
                  {tk(`fields.pest_${c.pest}`)}
                  <span className="ml-auto text-lino/70">{c.n}</span>
                </li>
              ))}
            </ul>
          )}
          {pestPts.length > 0 && (
            <>
              <p className="mt-2 text-lino/70">{t("ui.pestsSizeHint")}</p>
              <p className="mt-2 mb-1 font-medium">{t("ui.pestsByPlotTitle")}</p>
              <ul className="flex flex-col gap-0.5">
                {pestsByPlot(pestPts)
                  .slice(0, 5)
                  .map((c) => (
                    <li key={c.plotId}>
                      <button
                        className="num flex min-h-8 w-full cursor-pointer items-baseline gap-2 text-left underline-offset-4 hover:underline"
                        onClick={() => onSelect(c.plotId)}
                      >
                        <span className="min-w-0 flex-1 truncate">{plots.find((p) => p.id === c.plotId)?.name ?? "—"}</span>
                        <span className="text-lino/70">
                          {t("ui.pestsPlotCount", { n: c.n })} · {tk(`ui.pestIntensity_${c.worst}`)}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      )}
    </PanelSection>
  );
}
