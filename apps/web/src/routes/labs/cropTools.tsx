/** Vistas previas del Laboratorio sobre cultivos: rinde y recomendaciones. */
import { Button } from "../../components/ui";
import { t, tk } from "../../lib/i18n";
import { Figure, Flow, Table, nf } from "./parts";

const YIELD_PLOTS = [
  { id: "Norte 1", crop: "soy", ha: 120, low: 3100, high: 3700 },
  { id: "Norte 2", crop: "soy", ha: 92, low: 2900, high: 3500 },
  { id: "Sur 2", crop: "corn", ha: 64, low: 6800, high: 8200 },
] as const;

/** Vista previa de la estimación de rinde. */
export function Yield() {
  const sum = (k: "low" | "high") => YIELD_PLOTS.reduce((s, p) => s + (p.ha * p[k]) / 1000, 0);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button disabled>{t("ui.labs.yieldPick")}</Button>
      </div>
      <Flow drop={false}>
        <p className="text-sm text-tinta-2">
          {t("ui.labs.yieldCampaign")} · {t("ui.labs.askFarm")}
        </p>
        <Figure
          value={t("ui.labs.yieldTotalValue", { low: nf(sum("low")), high: nf(sum("high")) })}
          label={t("ui.labs.yieldTotal")}
        />
        <Table
          head={[t("ui.labs.yieldPlot"), t("ui.labs.yieldCrop"), t("ui.labs.paddockArea"), t("ui.labs.yieldRange")]}
          rows={YIELD_PLOTS.map((p) => [
            p.id,
            tk(`ui.labs.yieldCrop_${p.crop}`),
            `${nf(p.ha)} ha`,
            t("ui.labs.yieldRangeValue", { low: nf(p.low), high: nf(p.high) }),
          ])}
        />
        <div>
          <h3 className="font-semibold">{t("ui.labs.yieldBasis")}</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">
            <li>{t("ui.labs.yieldBasis1")}</li>
            <li>{t("ui.labs.yieldBasis2")}</li>
            <li>{t("ui.labs.yieldBasis3")}</li>
          </ul>
        </div>
        <p className="text-sm">{t("ui.labs.yieldNote")}</p>
        <div>
          <Button disabled>{t("ui.labs.yieldExport")}</Button>
        </div>
      </Flow>
    </div>
  );
}

/** Vista previa de las recomendaciones. */
export function Advice() {
  const sources = [1, 2, 3] as const;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button disabled>{t("ui.labs.advicePick")}</Button>
      </div>
      <Flow drop={false}>
        <p className="text-sm text-tinta-2">
          {t("ui.labs.summaryDraft")} · {t("ui.labs.adviceWalk")}
        </p>
        <div>
          <h3 className="font-semibold">{t("ui.labs.adviceSource")}</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {sources.map((n) => (
              <li key={n}>{tk(`ui.labs.adviceSource${n}`)}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold">{t("ui.labs.adviceDraftTitle")}</h3>
          <p className="mt-1 border-b border-linea pb-4">{t("ui.labs.adviceText")}</p>
        </div>
        <p className="text-sm">{t("ui.labs.adviceReview")}</p>
        <div>
          <Button disabled>{t("ui.labs.adviceEdit")}</Button>
        </div>
      </Flow>
    </div>
  );
}
