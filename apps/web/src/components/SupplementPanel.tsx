/** Suplementación y sal mineral por potrero (G-31). */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SUPPLEMENT_TYPES, type SupplementResponse } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtDay } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { Empty, ErrorBox, Field, Select, Spinner } from "./ui";
import { ExportableTable } from "./ExportableTable";

const int = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const DAY = 86_400_000;

export function SupplementPanel({ farmId }: { farmId: string }) {
  const [days, setDays] = useState("30");
  const q = useQuery({
    queryKey: ["supplements", farmId, days],
    queryFn: () => get<SupplementResponse>(`/org/farms/${farmId}/supplements?from=${Date.now() - Number(days) * DAY}`),
  });
  if (q.isLoading) return <Spinner rows={3} h={48} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const used = SUPPLEMENT_TYPES.filter((k) => (d.totals.byType[k] ?? 0) > 0);
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("ui.suppPeriod")}>
        <Select
          value={days}
          onChange={(e) => setDays(e.target.value)}
          options={["7", "30", "90"].map((v) => ({ value: v, label: t("ui.suppDays", { n: v }) }))}
        />
      </Field>
      {!d.plots.length ? (
        <Empty title={t("ui.herdNoPaddocks")}>{t("ui.herdNoPaddocksHint")}</Empty>
      ) : d.totals.kg === 0 ? (
        <Empty title={t("ui.suppNone")}>{t("ui.suppNoneHint")}</Empty>
      ) : (
        <>
          <p className="num text-sm">
            {t("ui.suppTotal", {
              kg: int.format(d.totals.kg),
              list: used.map((k) => `${int.format(d.totals.byType[k] ?? 0)} kg ${tk(`fields.supplementType_${k}`).toLowerCase()}`).join(", "),
            })}
          </p>
          {d.truncated && <p className="text-sm text-tinta-2">{t("ui.herdTruncated")}</p>}
          <div className="overflow-x-auto">
            <ExportableTable name="suplementacion">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-tinta-2">
                    <th className="pb-2 font-medium">{t("ui.plot")}</th>
                    <th className="pb-2 text-right font-medium">{t("ui.suppHead")}</th>
                    <th className="pb-2 text-right font-medium">{t("ui.suppKg")}</th>
                    <th className="pb-2 text-right font-medium">{t("ui.suppSaltKg")}</th>
                    <th className="pb-2 text-right font-medium">{t("ui.suppSaltPerHead")}</th>
                    <th className="pb-2 text-right font-medium">{t("ui.suppLast")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea border-t border-linea">
                  {d.plots.map((p) => (
                    <tr key={p.plotId}>
                      <td className="py-2.5 font-medium">{p.name}</td>
                      <td className="num py-2.5 text-right">{p.head ? int.format(p.head) : "—"}</td>
                      <td className="num py-2.5 text-right">{p.totalKg ? dec.format(p.totalKg) : "—"}</td>
                      <td className="num py-2.5 text-right">{p.byType.sal_mineral ? dec.format(p.byType.sal_mineral) : "—"}</td>
                      <td
                        className={`num py-2.5 text-right ${p.saltStatus === "low" || p.saltStatus === "high" ? "font-medium text-peligro" : ""}`}
                      >
                        {p.saltGPerHeadDay === null ? "—" : `${int.format(p.saltGPerHeadDay)} g`}
                        {p.saltStatus && p.saltStatus !== "ok" ? ` · ${t(`ui.suppSalt_${p.saltStatus}`)}` : ""}
                      </td>
                      <td className="num py-2.5 text-right text-tinta-2">{p.lastAt ? fmtDay(p.lastAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ExportableTable>
          </div>
          <p className="text-xs text-tinta-2">{t("ui.suppHint", { min: d.reference.min, max: d.reference.max })}</p>
        </>
      )}
    </div>
  );
}
