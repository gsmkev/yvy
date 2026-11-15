/** Abigeato (G-13): avisos de faltantes con fecha, categoría, cabezas y número de denuncia. */
import { useQuery } from "@tanstack/react-query";
import { HERD_CATEGORIES, type TheftResponse } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtDay } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { DataTable, Empty, ErrorBox, Spinner } from "./ui";
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
      <ExportableTable name="abigeato">
        <DataTable<(typeof d.rows)[number]>
          rows={d.rows}
          rowKey={(r) => r.id}
          columns={[
            { id: "date", header: t("ui.theftDate"), cell: (r) => <span className="num">{fmtDay(r.capturedAt)}</span> },
            { id: "plot", header: t("ui.plot"), cell: (r) => <span className="font-medium">{r.plotName ?? "—"}</span> },
            { id: "cat", header: t("fields.herdCategory"), cell: (r) => tk(`fields.herd_${r.category}`) },
            { id: "head", header: t("fields.head"), align: "right", cell: (r) => r.head },
            {
              id: "report",
              header: t("ui.theftReport"),
              cell: (r) =>
                r.policeReport ? (
                  <span className="num">{`${r.policeReport}${r.reportedAt ? ` · ${fmtDay(r.reportedAt)}` : ""}`}</span>
                ) : (
                  <span className="text-peligro">{t("ui.theftNoReport")}</span>
                ),
            },
          ]}
        />
      </ExportableTable>
      <p className="text-xs text-tinta-2">{t("ui.theftHint")}</p>
    </div>
  );
}
