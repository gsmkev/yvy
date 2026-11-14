import { useEffect, useMemo, useState } from "react";
import { SEED_RATE_KG_HA, sowingPlan, CROPS } from "@yvy/shared";
import { fmtHa, fmtNum } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useSeasons } from "../lib/queries";
import type { Plot } from "../lib/types";
import { Empty, ErrorBox, Input, Select, Spinner } from "./ui";
import { ExportableTable } from "./ExportableTable";

type Crop = (typeof CROPS)[number];

/** Plan de siembra de la campaña (A-03): superficie por cultivo y variedad y semilla que hay que comprar. */
export function SowingPlan({ farmId, plots }: { farmId: string; plots: Plot[] }) {
  const q = useSeasons(farmId);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [rates, setRates] = useState<Partial<Record<Crop, string>>>({});
  const seasons = q.data?.seasons ?? [];
  useEffect(() => {
    if (!seasonId || !seasons.some((s) => s.id === seasonId)) setSeasonId(seasons[0]?.id ?? null);
  }, [q.data]);
  const numericRates = useMemo(() => {
    const out: Partial<Record<Crop, number>> = {};
    for (const [k, v] of Object.entries(rates)) {
      const n = Number(v);
      if (v !== "" && Number.isFinite(n) && n >= 0) out[k as Crop] = n;
    }
    return out;
  }, [rates]);
  const plan = useMemo(
    () =>
      seasonId
        ? sowingPlan(
            plots.map((p) => ({ id: p.id, kind: p.kind, areaHa: p.areaHa })),
            (q.data?.plotSeasons ?? []).map((p) => ({ ...p, crop: p.crop as Crop | null })),
            seasonId,
            numericRates,
          )
        : null,
    [plots, q.data, seasonId, numericRates],
  );
  if (q.isLoading) return <Spinner rows={3} h={40} />;
  if (q.error) return <ErrorBox error={q.error} />;
  return (
    <section aria-labelledby="sowing-plan-h" className="flex flex-col gap-3">
      <h3 id="sowing-plan-h" className="text-[18px] leading-6 font-semibold">
        {t("ui.sowPlanTitle")}
      </h3>
      {seasons.length === 0 || !plan ? (
        <Empty title={t("ui.sowPlanTitle")}>{t("ui.seasonNone")}</Empty>
      ) : (
        <>
          <Select
            aria-label={t("ui.season")}
            value={seasonId ?? ""}
            onChange={(e) => setSeasonId(e.target.value)}
            options={seasons.map((s) => ({ value: s.id, label: s.name }))}
          />
          {plan.rows.length === 0 ? (
            <p className="text-sm text-tinta-2">{t("ui.sowPlanEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <ExportableTable name="plan-de-siembra">
                <table className="w-full text-sm">
                  <thead className="text-left text-tinta-2">
                    <tr>
                      <th className="py-2 pr-3 font-medium">{t("ui.crop")}</th>
                      <th className="py-2 pr-3 font-medium">{t("ui.seasonVariety")}</th>
                      <th className="num py-2 pr-3 text-right font-medium">{t("ui.sowPlanPlots")}</th>
                      <th className="num py-2 pr-3 text-right font-medium">{t("ui.sowPlanArea")}</th>
                      <th className="py-2 pr-3 font-medium">{t("ui.sowPlanRate")}</th>
                      <th className="num py-2 text-right font-medium">{t("ui.sowPlanSeed")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-linea border-y border-linea">
                    {plan.rows.map((r) => (
                      <tr key={`${r.crop}-${r.variety ?? ""}`}>
                        <td className="py-2.5 pr-3">{tk(`fields.crop_${r.crop}`)}</td>
                        <td className="py-2.5 pr-3">{r.variety ?? t("ui.sowPlanNoVariety")}</td>
                        <td className="num py-2.5 pr-3 text-right">{r.plots}</td>
                        <td className="num py-2.5 pr-3 text-right whitespace-nowrap">{fmtHa(r.areaHa)}</td>
                        <td className="py-2.5 pr-3">
                          <Input
                            aria-label={t("ui.sowPlanRateFor", { crop: tk(`fields.crop_${r.crop}`) })}
                            className="num h-8 w-16"
                            inputMode="decimal"
                            value={rates[r.crop] ?? String(SEED_RATE_KG_HA[r.crop])}
                            onChange={(e) => setRates({ ...rates, [r.crop]: e.target.value })}
                          />
                        </td>
                        <td className="num py-2.5 text-right font-medium whitespace-nowrap">{fmtNum(r.seedKg)} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ExportableTable>
            </div>
          )}
          <p className="num text-sm">
            {t("ui.sowPlanTotal", { area: fmtHa(plan.plannedHa) })}
            {plan.unplannedPlots > 0 && (
              <span className="text-tinta-2">
                {" · "}
                {t("ui.sowPlanUnplanned", { n: plan.unplannedPlots, area: fmtHa(plan.unplannedHa) })}
              </span>
            )}
          </p>
          <p className="text-xs text-tinta-2">{t("ui.sowPlanRateNote")}</p>
        </>
      )}
    </section>
  );
}
