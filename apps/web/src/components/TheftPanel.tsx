/** Abigeato: avisos de faltantes con fecha, categoría, cabezas y número de denuncia. */
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
  if (!d.rows.length) return <Empty title={t("ui.theft.none")}>{t("ui.theft.noneHint")}</Empty>;
  return (
    <div className="flex flex-col gap-4">
      <p className="num text-sm">
        {t("ui.theft.summary", {
          head: d.totals.head,
          list: HERD_CATEGORIES.filter((c) => d.totals.byCategory[c] > 0)
            .map((c) => `${d.totals.byCategory[c]} ${tk(`fields.herd.${c}`).toLowerCase()}`)
            .join(", "),
        })}
      </p>
      {d.totals.withoutReport > 0 && (
        <p role="status" className="text-sm font-medium text-peligro">
          {t("ui.theft.withoutReport", { n: d.totals.withoutReport })}
        </p>
      )}
      {d.truncated && <p className="text-sm text-tinta-2">{t("ui.herd.truncated")}</p>}
      <ExportableTable name="abigeato">
        <DataTable<(typeof d.rows)[number]>
          rows={d.rows}
          rowKey={(r) => r.id}
          columns={[
            { id: "date", header: t("ui.theft.date"), cell: (r) => <span className="num">{fmtDay(r.capturedAt)}</span> },
            { id: "plot", header: t("ui.common.plot"), cell: (r) => <span className="font-medium">{r.plotName ?? "—"}</span> },
            { id: "cat", header: t("fields.herd.category"), cell: (r) => tk(`fields.herd.${r.category}`) },
            { id: "head", header: t("fields.common.head"), align: "right", cell: (r) => r.head },
            {
              id: "report",
              header: t("ui.theft.report"),
              cell: (r) =>
                r.policeReport ? (
                  <span className="num">{`${r.policeReport}${r.reportedAt ? ` · ${fmtDay(r.reportedAt)}` : ""}`}</span>
                ) : (
                  <span className="text-peligro">{t("ui.theft.noReport")}</span>
                ),
            },
          ]}
        />
      </ExportableTable>
      <p className="text-xs text-tinta-2">{t("ui.theft.hint")}</p>
    </div>
  );
}
