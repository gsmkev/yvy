/** Reproducción: índices de preñez, parición y destete, y los últimos eventos. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ReproductionResponse } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtDay } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { Empty, ErrorBox, Field, Select, Spinner, Stat } from "./ui";
import { ExportableTable } from "./ExportableTable";

const DAY = 86_400_000;
const pctText = (v: number | null) =>
  v === null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 }).format(v) + " %";

export function ReproPanel({ farmId }: { farmId: string }) {
  const [days, setDays] = useState("365");
  const q = useQuery({
    queryKey: ["reproduction", farmId, days],
    queryFn: () => get<ReproductionResponse>(`/org/farms/${farmId}/reproduction?from=${Date.now() - Number(days) * DAY}`),
  });
  if (q.isLoading) return <Spinner rows={3} h={48} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const i = d.indices;
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("ui.supp.period")}>
        <Select
          value={days}
          onChange={(e) => setDays(e.target.value)}
          options={[
            { value: "180", label: t("ui.supp.days", { n: 180 }) },
            { value: "365", label: t("ui.repro.year") },
            { value: "730", label: t("ui.repro.twoYears") },
          ]}
        />
      </Field>
      {!d.rows.length ? (
        <Empty title={t("ui.repro.none")}>{t("ui.repro.noneHint")}</Empty>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label={t("ui.repro.pregnancy")} value={pctText(i.pregnancyPct)} note={t("ui.repro.pregnancyHint", { p: i.pregnant, c: i.checked })} />
            <Stat label={t("ui.repro.calving")} value={pctText(i.calvingPct)} note={t("ui.repro.calvingHint", { b: i.calvesBorn, s: i.services })} />
            <Stat label={t("ui.repro.weaning")} value={pctText(i.weaningPct)} note={t("ui.repro.weaningHint", { w: i.weaned, b: i.calvesBorn })} />
          </div>
          {d.truncated && <p className="text-sm text-tinta-2">{t("ui.herd.truncated")}</p>}
          <div className="overflow-x-auto">
            <ExportableTable name="reproduccion">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-tinta-2">
                    <th className="pb-2 font-medium">{t("ui.theft.date")}</th>
                    <th className="pb-2 font-medium">{t("fields.repro.event")}</th>
                    <th className="pb-2 font-medium">{t("ui.common.plot")}</th>
                    <th className="pb-2 text-right font-medium">{t("fields.common.head")}</th>
                    <th className="pb-2 font-medium">{t("ui.repro.detail")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea border-t border-linea">
                  {d.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="num py-2.5">{fmtDay(r.capturedAt)}</td>
                      <td className="py-2.5 font-medium">{tk(`fields.repro.event_${r.event}`)}</td>
                      <td className="py-2.5">{r.plotName ?? "—"}</td>
                      <td className="num py-2.5 text-right">{r.head}</td>
                      <td className="py-2.5 text-tinta-2">
                        {[
                          r.method ? tk(`fields.repro.method_${r.method}`) : null,
                          r.pregnant !== null ? t("fields.repro.pregnantValue", { n: r.pregnant }) : null,
                          r.calves !== null ? t("fields.repro.calvesValue", { n: r.calves }) : null,
                          r.tag ? t("fields.common.tagValue", { n: r.tag }) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ExportableTable>
          </div>
          <p className="text-xs text-tinta-2">{t("ui.repro.hint")}</p>
        </>
      )}
    </div>
  );
}
