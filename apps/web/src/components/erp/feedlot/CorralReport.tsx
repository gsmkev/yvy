/** Reporte del feedlot por corral. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { localDate } from "@yvy/shared";
import { get, withQs } from "../../../lib/api";
import { fmtDate, fmtNum } from "../../../lib/format";
import { t, tk } from "../../../lib/i18n";
import { useFarms } from "../../../lib/queries";
import { Button, type Column, DataTable, DateRange, EmptyState, ErrorBox, Field, FilterBar, Select, Spinner } from "../../ui";
import { ExportableTable } from "../../ExportableTable";
import type { Corral } from "./types";

/** Reporte por corral: alimento, ganancia y conversión en el período. */
export function CorralReport({ canFeed, hasRations, onFeed, onNewRation }: { canFeed: boolean; hasRations: boolean; onFeed: () => void; onNewRation: () => void }) {
  const farms = useFarms();
  const today = localDate(Date.now());
  const [f, setF] = useState({ farmId: "", from: localDate(Date.now() - 60 * 86_400_000), to: today });
  const q = useQuery({
    queryKey: ["erp", "feedlot", "report", f],
    queryFn: () =>
      get<{ truncated: boolean; corrals: Corral[] }>(
        withQs("/org/erp/feedlot/report", { farmId: f.farmId || undefined, from: f.from, to: f.to }),
      ),
  });
  const rows = q.data?.corrals ?? [];
  const columns: Column<Corral>[] = [
    { id: "corral", header: t("ui.feedlot.corral"), cell: (c) => c.plotName },
    { id: "dm", header: t("ui.feedlot.colDm"), align: "right", hideBelow: "sm", cell: (c) => fmtNum(c.feedKgDm) },
    { id: "asfed", header: t("ui.feedlot.colAsFed"), align: "right", hideBelow: "md", cell: (c) => fmtNum(c.feedKgAsFed) },
    { id: "gain", header: t("ui.feedlot.colGain"), align: "right", hideBelow: "sm", cell: (c) => (c.gainKg !== null ? `${fmtNum(c.gainKg)} kg` : "—") },
    {
      id: "conv",
      header: t("ui.feedlot.colConversion"),
      align: "right",
      cell: (c) =>
        c.conversion !== null ? (
          <>
            {fmtNum(c.conversion)}
            <span className="block text-meta text-tinta-2">{t("ui.feedlot.window", { from: fmtDate(c.firstAt!), to: fmtDate(c.lastAt!), head: c.head ?? 0 })}</span>
          </>
        ) : (
          <span className="text-tinta-2">{tk(`ui.feedlot.status_${c.status}`)}</span>
        ),
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <FilterBar active={Object.values(f).filter(Boolean).length} onClear={() => setF({ farmId: "", from: "", to: "" })}>
        <Field label={t("ui.cost.farm")}>
          <Select value={f.farmId} onChange={(e) => setF({ ...f, farmId: e.target.value })} options={[{ value: "", label: t("ui.common.all") }, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
        <DateRange from={f.from} to={f.to} onChange={(r) => setF({ ...f, ...r })} />
      </FilterBar>
      {q.isLoading && <Spinner />}
      {q.error && <ErrorBox error={q.error} />}
      {q.data && rows.length === 0 && (
        <EmptyState
          title={t("ui.feedlot.noFeedsTitle")}
          action={
            hasRations ? (
              canFeed ? (
                <Button variant="primary" onClick={onFeed}>
                  {t("ui.feedlot.feed")}
                </Button>
              ) : undefined
            ) : (
              <Button variant="primary" onClick={onNewRation}>
                {t("ui.feedlot.rationNew")}
              </Button>
            )
          }
        >
          {hasRations ? t("ui.feedlot.noFeeds") : t("ui.feedlot.noFeedsNoRations")}
        </EmptyState>
      )}
      {rows.length > 0 && (
        <ExportableTable name="feedlot">
          <DataTable columns={columns} rows={rows} rowKey={(c) => c.plotId} caption={t("ui.feedlot.report")} />
        </ExportableTable>
      )}
      {q.data?.truncated && <p className="text-meta text-tinta-2">{t("ui.feedlot.truncated")}</p>}
      {rows.length > 0 && <p className="text-meta text-tinta-2">{t("ui.feedlot.reportHint")}</p>}
    </div>
  );
}
