/** Costos y ventas con centro de costo: estancia, lote, campaña y actividad. */
import { useState } from "react";
import { fmtGs } from "../../lib/money";
import { t } from "../../lib/i18n";
import { useFarms } from "../../lib/queries";
import { Button, ConfirmModal, DataTable, EmptyState, ErrorBox, Spinner, Stat, StatRow } from "../ui";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions } from "./adminSlot";
import { CostFilterBar } from "./costs/CostFilterBar";
import { CostModal } from "./costs/CostModal";
import { costColumns, costLabel } from "./costs/costColumns";
import { NO_COST_FILTERS, useCostList, useRemoveCost, type CostEntry, type CostList } from "./costs/useCosts";

function CostTotals({ totals }: { totals: CostList["totals"] }) {
  const result = totals.incomePyg - totals.costPyg;
  return (
    <StatRow>
      <Stat label={t("ui.cost.totalCost")} value={fmtGs(totals.costPyg)} />
      <Stat label={t("ui.cost.totalIncome")} value={fmtGs(totals.incomePyg)} />
      <Stat label={t("ui.cost.result")} value={fmtGs(result)} tone={result < 0 ? "danger" : undefined} />
    </StatRow>
  );
}

/** Costos y ventas con su centro de costo. */
export function CostsPanel() {
  const farms = useFarms();
  const [f, setF] = useState(NO_COST_FILTERS);
  const [editing, setEditing] = useState<CostEntry | "new" | null>(null);
  const [removing, setRemoving] = useState<CostEntry | null>(null);
  const q = useCostList(f);
  const remove = useRemoveCost(() => setRemoving(null));
  const farmName = (id: string | null) => farms.data?.find((x) => x.id === id)?.name ?? "";
  const rows = q.data?.rows ?? [];
  const filtered = Object.values(f).some(Boolean);
  const blank = !!q.data && rows.length === 0 && !filtered;
  const newBtn = (
    <Button variant="primary" onClick={() => setEditing("new")}>
      {t("ui.cost.new")}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      {!blank && <HeaderActions>{newBtn}</HeaderActions>}
      {!blank && <CostFilterBar f={f} onChange={setF} />}
      {q.data && rows.length > 0 && <CostTotals totals={q.data.totals} />}
      {q.isLoading && <Spinner />}
      {q.error ? <ErrorBox error={q.error} /> : null}
      {blank && (
        <EmptyState title={t("ui.cost.emptyTitle")} action={newBtn}>
          {t("ui.cost.emptyHint")}
        </EmptyState>
      )}
      {q.data && rows.length === 0 && filtered && (
        <EmptyState title={t("ui.cost.emptyFiltered")} action={<Button onClick={() => setF(NO_COST_FILTERS)}>{t("ui.cost.clearFilters")}</Button>} />
      )}
      {rows.length > 0 && (
        <ExportableTable name="costos">
          <DataTable columns={costColumns(farmName, setEditing, setRemoving)} rows={rows} rowKey={(c) => c.id} />
        </ExportableTable>
      )}
      {editing && <CostModal entry={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmModal
          title={costLabel(removing)}
          message={t("ui.erp.deleteConfirm", { name: costLabel(removing) })}
          confirmLabel={t("ui.common.delete")}
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
