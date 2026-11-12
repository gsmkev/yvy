/** Abigeato (G-13): avisos de faltantes con fecha, categoría, cabezas y número de denuncia. */
import { useQuery } from "@tanstack/react-query";
import { HERD_CATEGORIES, type TheftResponse } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtDay } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { Empty, ErrorBox, Spinner } from "./ui";
import { ExportableTable } from "./ExportableTable";

export function TheftPanel({ farmId }: { farmId: string }) {
  const q = useQuery({
    queryKey: ["theft", farmId],
    queryFn: () => get<TheftResponse>(`/org/farms/${farmId}/theft`),
  });
  if (q.isLoading) return <Spinner rows={3} h={48} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  if (!d.rows.length) return <Empty title={t("ui.theftNone")}>{t("ui.theftNoneHint")}</Empty>;
  return (
    <div className="flex flex-col gap-4">
      <p className="num text-sm">
        {t("ui.theftSummary", {
          head: d.totals.head,
          list: HERD_CATEGORIES.filter((c) => d.totals.byCategory[c] > 0)
            .map((c) => `${d.totals.byCategory[c]} ${tk(`fields.herd_${c}`).toLowerCase()}`)
            .join(", "),
        })}
      </p>
      {d.totals.withoutReport > 0 && (
        <p role="status" className="text-sm font-medium text-peligro">
          {t("ui.theftWithoutReport", { n: d.totals.withoutReport })}
        </p>
      )}
      {d.truncated && <p className="text-sm text-tinta-2">{t("ui.herdTruncated")}</p>}
      <div className="overflow-x-auto">
        <ExportableTable name="abigeato">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-tinta-2">
                <th className="pb-2 font-medium">{t("ui.theftDate")}</th>
                <th className="pb-2 font-medium">{t("ui.plot")}</th>
                <th className="pb-2 font-medium">{t("fields.herdCategory")}</th>
                <th className="pb-2 text-right font-medium">{t("fields.head")}</th>
                <th className="pb-2 font-medium">{t("ui.theftReport")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea border-t border-linea">
              {d.rows.map((r) => (
                <tr key={r.id}>
                  <td className="num py-2.5">{fmtDay(r.capturedAt)}</td>
                  <td className="py-2.5 font-medium">{r.plotName ?? "—"}</td>
                  <td className="py-2.5">{tk(`fields.herd_${r.category}`)}</td>
                  <td className="num py-2.5 text-right">{r.head}</td>
                  <td className="num py-2.5">
                    {r.policeReport ? (
                      `${r.policeReport}${r.reportedAt ? ` · ${fmtDay(r.reportedAt)}` : ""}`
                    ) : (
                      <span className="text-peligro">{t("ui.theftNoReport")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ExportableTable>
      </div>
      <p className="text-xs text-tinta-2">{t("ui.theftHint")}</p>
    </div>
  );
}
