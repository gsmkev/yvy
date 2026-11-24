import { Button } from "../../components/ui";
import { t, tk } from "../../lib/i18n";
import { Figure, Flow, Table, nf } from "./parts";

const YIELD_PLOTS = [
  { id: "Norte 1", crop: "soy", ha: 120, low: 3100, high: 3700 },
  { id: "Norte 2", crop: "soy", ha: 92, low: 2900, high: 3500 },
  { id: "Sur 2", crop: "corn", ha: 64, low: 6800, high: 8200 },
] as const;

export function Yield() {
  const sum = (k: "low" | "high") => YIELD_PLOTS.reduce((s, p) => s + (p.ha * p[k]) / 1000, 0);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button disabled>{t("ui.labsYieldPick")}</Button>
      </div>
      <Flow drop={false}>
        <p className="text-sm text-tinta-2">
          {t("ui.labsYieldCampaign")} · {t("ui.labsAskFarm")}
        </p>
        <Figure
          value={t("ui.labsYieldTotalValue", { low: nf(sum("low")), high: nf(sum("high")) })}
          label={t("ui.labsYieldTotal")}
        />
        <Table
          head={[t("ui.labsYieldPlot"), t("ui.labsYieldCrop"), t("ui.labsPaddockArea"), t("ui.labsYieldRange")]}
          rows={YIELD_PLOTS.map((p) => [
            p.id,
            tk(`ui.labsYieldCrop_${p.crop}`),
            `${nf(p.ha)} ha`,
            t("ui.labsYieldRangeValue", { low: nf(p.low), high: nf(p.high) }),
          ])}
        />
        <div>
          <h3 className="font-semibold">{t("ui.labsYieldBasis")}</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">
            <li>{t("ui.labsYieldBasis1")}</li>
            <li>{t("ui.labsYieldBasis2")}</li>
            <li>{t("ui.labsYieldBasis3")}</li>
          </ul>
        </div>
        <p className="text-sm">{t("ui.labsYieldNote")}</p>
        <div>
          <Button disabled>{t("ui.labsYieldExport")}</Button>
        </div>
      </Flow>
    </div>
  );
}

export function Advice() {
  const sources = [1, 2, 3] as const;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button disabled>{t("ui.labsAdvicePick")}</Button>
      </div>
      <Flow drop={false}>
        <p className="text-sm text-tinta-2">
          {t("ui.labsSummaryDraft")} · {t("ui.labsAdviceWalk")}
        </p>
        <div>
          <h3 className="font-semibold">{t("ui.labsAdviceSource")}</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {sources.map((n) => (
              <li key={n}>{tk(`ui.labsAdviceSource${n}`)}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold">{t("ui.labsAdviceDraftTitle")}</h3>
          <p className="mt-1 border-b border-linea pb-4">{t("ui.labsAdviceText")}</p>
        </div>
        <p className="text-sm">{t("ui.labsAdviceReview")}</p>
        <div>
          <Button disabled>{t("ui.labsAdviceEdit")}</Button>
        </div>
      </Flow>
    </div>
  );
}
