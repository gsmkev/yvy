import { CHART, ATTRIBUTION } from "@yvy/shared";
import { fmtDate, fmtDay, fmtNdvi, fmtPct } from "../../lib/format";
import { Minus, Satellite, TrendingDown, TrendingUp } from "lucide-react";
import { t } from "../../lib/i18n";
import { LineChart } from "../charts";
import { Empty, Stat } from "../ui";
import type { Plot } from "../../lib/types";
import type { Ndvi } from "./usePlotData";

export function NdviSection({ plot, data }: { plot: Plot; data: Ndvi }) {
  const delta = data.deltaVsFarmPct ?? null;
  return (
    <div className="border-t border-linea pt-4">
      {data.current ? (
        <>
          <div className="flex items-end gap-6">
            <Stat
              label={t("ui.ndvi.current")}
              value={fmtNdvi(data.current.mean)}
              note={fmtDate(data.current.acquiredAt)}
            />
            {delta !== null && (
              <div className="flex flex-col gap-0.5 pb-0.5">
                <span className="eyebrow">{t("ui.farm.average")}</span>
                <span
                  className={`num flex items-center gap-1 text-base font-medium ${delta < -5 ? "text-peligro" : ""}`}
                >
                  {delta < -0.5 ? (
                    <TrendingDown size={16} aria-hidden />
                  ) : delta > 0.5 ? (
                    <TrendingUp size={16} aria-hidden />
                  ) : (
                    <Minus size={16} aria-hidden />
                  )}
                  {Math.abs(delta) < 0.5 ? t("ui.common.sameAsFarm") : fmtPct(delta)}
                </span>
              </div>
            )}
          </div>
          {data.current.lowConfidence && (
            <p className="mt-2 rounded border border-trigo/60 px-2 py-1 text-xs text-tinta-2" role="note">
              <strong>{t("ui.low.confidence")}.</strong> {t("ui.low.confidenceNote")}
            </p>
          )}
          {data.others && Object.keys(data.others).length > 0 && (
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
              {(["ndre", "ndmi", "evi"] as const).map((k) => {
                const o = data.others![k];
                return o ? (
                  <div key={k}>
                    <dt className="eyebrow">{t(`ui.index.${k}`)}</dt>
                    <dd className="num text-base font-medium">{fmtNdvi(o.mean)}</dd>
                  </div>
                ) : null;
              })}
            </dl>
          )}
          <h3 className="eyebrow mt-5 mb-1">{t("ui.ndvi.curve")}</h3>
          <LineChart
            ariaLabel={t("ui.ndvi.curve")}
            yLabel="NDVI"
            yDomain={[0, 1]}
            formatX={(x) => fmtDay(x)}
            formatY={(y) => fmtNdvi(y)}
            series={[
              {
                name: plot.name,
                color: CHART.primary,
                points: data.series.map((p) => ({ x: p.acquiredAt, y: p.mean })),
              },
              {
                name: t("ui.farm.average"),
                color: CHART.comparison,
                dashed: true,
                points: data.farmAvg.map((p) => ({ x: p.acquiredAt, y: p.mean })),
              },
            ]}
          />
          <p className="mt-1 text-micro text-tinta-2">{t(ATTRIBUTION.copernicus)}</p>
        </>
      ) : (
        <Empty icon={Satellite}>{t("ui.no.ndvi")}</Empty>
      )}
    </div>
  );
}
