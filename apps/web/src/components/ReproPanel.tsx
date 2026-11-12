/** Reproducción (G-20): índices de preñez, parición y destete, y los últimos eventos. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ReproductionResponse } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtDay } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { Empty, ErrorBox, Field, Select, Spinner, Stat } from "./ui";
import { ExportableTable } from "./ExportableTable";

const DAY = 86_400_000;
const pctText = (v: number | null) => (v === null ? "—" : `${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 }).format(v)} %`);

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
      <Field label={t("ui.suppPeriod")}>
        <Select
          value={days}
          onChange={(e) => setDays(e.target.value)}
          options={[
            { value: "180", label: t("ui.suppDays", { n: 180 }) },
            { value: "365", label: t("ui.reproYear") },
            { value: "730", label: t("ui.reproTwoYears") },
          ]}
        />
      </Field>
      {!d.rows.length ? (
        <Empty title={t("ui.reproNone")}>{t("ui.reproNoneHint")}</Empty>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label={t("ui.reproPregnancy")} value={pctText(i.pregnancyPct)} note={t("ui.reproPregnancyHint", { p: i.pregnant, c: i.checked })} />
            <Stat label={t("ui.reproCalving")} value={pctText(i.calvingPct)} note={t("ui.reproCalvingHint", { b: i.calvesBorn, s: i.services })} />
            <Stat label={t("ui.reproWeaning")} value={pctText(i.weaningPct)} note={t("ui.reproWeaningHint", { w: i.weaned, b: i.calvesBorn })} />
          </div>
          {d.truncated && <p className="text-sm text-tinta-2">{t("ui.herdTruncated")}</p>}
          <div className="overflow-x-auto">
            <ExportableTable name="reproduccion">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-tinta-2">
                    <th className="pb-2 font-medium">{t("ui.theftDate")}</th>
                    <th className="pb-2 font-medium">{t("fields.reproEvent")}</th>
                    <th className="pb-2 font-medium">{t("ui.plot")}</th>
                    <th className="pb-2 text-right font-medium">{t("fields.head")}</th>
                    <th className="pb-2 font-medium">{t("ui.reproDetail")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea border-t border-linea">
                  {d.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="num py-2.5">{fmtDay(r.capturedAt)}</td>
                      <td className="py-2.5 font-medium">{tk(`fields.reproEvent_${r.event}`)}</td>
                      <td className="py-2.5">{r.plotName ?? "—"}</td>
                      <td className="num py-2.5 text-right">{r.head}</td>
                      <td className="py-2.5 text-tinta-2">
                        {[
                          r.method ? tk(`fields.reproMethod_${r.method}`) : null,
                          r.pregnant !== null ? t("fields.reproPregnantValue", { n: r.pregnant }) : null,
                          r.calves !== null ? t("fields.reproCalvesValue", { n: r.calves }) : null,
                          r.tag ? t("fields.tagValue", { n: r.tag }) : null,
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
          <p className="text-xs text-tinta-2">{t("ui.reproHint")}</p>
        </>
      )}
    </div>
  );
}
