import { fmtDate, fmtIsoDate, fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtDensity } from "../SeasonsPanel";
import { ErrorBox, Spinner } from "../ui";
import type { UseQueryResult } from "@tanstack/react-query";
import type { PlotHistoryRow } from "../../lib/types";

export function RotationSection({ history }: { history: UseQueryResult<PlotHistoryRow[]> }) {
  return (
    <div className="border-t border-linea pt-4">
      <h3 className="eyebrow mb-1">{t("ui.rotation.title")}</h3>
      {history.isLoading && <Spinner />}
      {history.error && <ErrorBox error={history.error} />}
      {history.data && history.data.length === 0 && <p className="text-sm text-tinta-2">{t("ui.rotation.none")}</p>}
      {history.data && history.data.length > 0 && (
        <ul className="divide-y divide-linea border-y border-linea text-sm">
          {history.data.map((h) => (
            <li key={h.seasonId} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{h.seasonName}</span>
                <span>{h.crop ? tk(`fields.crop.${h.crop}`) : "—"}</span>
              </div>
              {h.yieldTHa !== null && (
                <p className="num mt-0.5">
                  {t("ui.yield.perHa")}: <strong>{fmtNum(h.yieldTHa)} t/ha</strong>
                  <span className="text-xs text-tinta-2">
                    {" "}
                    · {t("ui.rotation.harvest", { tons: fmtNum(h.harvestTons ?? 0) })}
                    {h.targetYieldTHa !== null ? " · " + t("ui.yield.vsTarget", { n: fmtNum(h.targetYieldTHa) }) : ""}
                  </span>
                </p>
              )}
              <p className="num mt-0.5 text-xs text-tinta-2">
                {[
                  h.variety,
                  h.sownOn
                    ? t("ui.rotation.sown", { date: fmtDate(h.sownOn) })
                    : h.plannedSowingDate
                      ? t("ui.rotation.planned", { date: fmtIsoDate(h.plannedSowingDate) })
                      : null,
                  h.sowingDensity !== null && h.densityUnit ? fmtDensity(h.sowingDensity, h.densityUnit) : null,
                  h.targetYieldTHa !== null && h.yieldTHa === null ? `${t("ui.season.targetYield")}: ${fmtNum(h.targetYieldTHa)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
