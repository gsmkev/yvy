/** Pestaña Hacienda (G-03): hacienda calculada por potrero, carga animal y límite configurable. */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HERD_CATEGORIES, MAX_UA_PER_HA_LIMITS, UA_EQUIVALENTS, type FarmStockResponse } from "@yvy/shared";
import { get, put } from "../lib/api";
import { fmtDay, fmtHa } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useMe } from "../lib/queries";
import { HeatStressCard } from "./HeatStress";
import { Button, Empty, ErrorBox, Field, Input, Spinner } from "./ui";

const dec = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const num = (v: string) => Number(v.replace(",", "."));

export function HerdPanel({ farmId }: { farmId: string }) {
  const me = useMe();
  const canEditLimit = me.data?.role === "owner" || me.data?.role === "admin";
  const qc = useQueryClient();
  const stock = useQuery({
    queryKey: ["stock", farmId],
    queryFn: () => get<FarmStockResponse>(`/org/farms/${farmId}/stock`),
  });
  const [limit, setLimit] = useState("");
  useEffect(() => {
    if (stock.data) setLimit(String(stock.data.maxUaPerHa).replace(".", ","));
  }, [stock.data?.maxUaPerHa]);
  const limitOk =
    limit.trim() !== "" && num(limit) >= MAX_UA_PER_HA_LIMITS.min && num(limit) <= MAX_UA_PER_HA_LIMITS.max;
  const save = useMutation({
    mutationFn: () => put(`/org/farms/${farmId}/livestock-settings`, { maxUaPerHa: num(limit) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stock", farmId] }),
  });

  if (stock.isLoading) return <Spinner rows={5} h={56} />;
  if (stock.error) return <ErrorBox error={stock.error} />;
  const d = stock.data;
  if (!d) return null;
  if (!d.plots.length) return <Empty title={t("ui.herdNoPaddocks")}>{t("ui.herdNoPaddocksHint")}</Empty>;
  const over = d.plots.filter((p) => p.overLimit);
  const maxText = dec.format(d.maxUaPerHa);

  return (
    <div className="mt-4 flex flex-col gap-6">
      <div>
        <p className="num text-sm">
          {t("ui.herdFarmLine", {
            head: int.format(d.farm.total),
            ua: dec.format(d.farm.ua),
            area: fmtHa(d.farm.areaHa),
          })}
          {d.farm.uaPerHa !== null && ` · ${t("ui.herdUaPerHa", { v: dec.format(d.farm.uaPerHa) })}`}
        </p>
        {(d.farm.overLimit || over.length > 0) && (
          <p role="alert" className="mt-2 text-sm font-medium text-peligro">
            {t("ui.herdOverLimit", { max: maxText, plots: over.map((p) => p.name).join(", ") || t("ui.herdWholeFarm") })}
          </p>
        )}
        {d.truncated && <p className="mt-2 text-sm text-tinta-2">{t("ui.herdTruncated")}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-tinta-2">
              <th className="pb-2 font-medium">{t("ui.plot")}</th>
              {HERD_CATEGORIES.map((c) => (
                <th key={c} className="pb-2 text-right font-medium">
                  {tk(`fields.herd_${c}`)}
                </th>
              ))}
              <th className="pb-2 text-right font-medium">{t("ui.herdTotal")}</th>
              <th className="pb-2 text-right font-medium">{t("ui.herdUaPerHaHead")}</th>
              <th className="pb-2 text-right font-medium">{t("ui.herdLastCount")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linea border-t border-linea">
            {d.plots.map((p) => (
              <tr key={p.plotId}>
                <td className="py-2.5 font-medium">{p.name}</td>
                {HERD_CATEGORIES.map((c) => (
                  <td key={c} className="num py-2.5 text-right">
                    {p.counts[c] || "—"}
                  </td>
                ))}
                <td className="num py-2.5 text-right font-medium">{int.format(p.total)}</td>
                <td className={`num py-2.5 text-right ${p.overLimit ? "font-medium text-peligro" : ""}`}>
                  {p.uaPerHa === null ? "—" : dec.format(p.uaPerHa)}
                </td>
                <td className="num py-2.5 text-right text-tinta-2">
                  {p.lastCountAt ? fmtDay(p.lastCountAt) : t("ui.herdNeverCounted")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        className="flex max-w-xl flex-col gap-3 border-t border-linea pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (limitOk) save.mutate();
        }}
      >
        <Field label={t("ui.herdLimitLabel")} hint={t("ui.herdLimitHint")}>
          <Input
            inputMode="decimal"
            className="w-32"
            value={limit}
            disabled={!canEditLimit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </Field>
        {d.maxUaIsDefault && <p className="text-sm text-tinta-2">{t("ui.herdLimitIsDefault")}</p>}
        {canEditLimit ? (
          <div>
            <Button variant="primary" type="submit" disabled={!limitOk || save.isPending}>
              {t("ui.save")}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-tinta-2">{t("ui.alertSettingsOnlyOwner")}</p>
        )}
        {save.error ? <ErrorBox error={save.error} /> : null}
      </form>

      <HeatStressCard farmId={farmId} />

      <p className="text-xs text-tinta-2">
        {t("ui.herdEquivalents", {
          list: HERD_CATEGORIES.map((c) => `${tk(`fields.herd_${c}`).toLowerCase()} ${dec.format(UA_EQUIVALENTS[c])}`).join(", "),
        })}
      </p>
    </div>
  );
}
