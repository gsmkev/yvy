/** Presupuesto de campaña por lote, cultivo y actividad, frente a lo real. */
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { del, get } from "../../lib/api";
import { t } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { Button, DataTable, EmptyState, ErrorBox, Field, FilterBar, Select, Spinner, Stat, StatRow, toast } from "../ui";
import { useSeasonList } from "./costs/useCosts";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions } from "./adminSlot";
import { LineModal } from "./budget/LineModal";
import { budgetColumns, type BudgetCompare } from "./budget/budgetColumns";

const useBudget = (season: string) =>
  useQuery({ enabled: !!season, queryKey: ["erp", "budget", season], queryFn: () => get<BudgetCompare>(`/org/erp/budget/compare?seasonId=${season}`) });

function useRemoveLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/org/erp/budget-lines/${id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
}

function BudgetTotals({ totals }: { totals: BudgetCompare["totals"] }) {
  return (
    <StatRow>
      <Stat label={t("ui.budget.costPlanned")} value={fmtGs(totals.costPlannedPyg)} />
      <Stat label={t("ui.budget.costActual")} value={fmtGs(totals.costActualPyg)} />
      <Stat label={t("ui.budget.incomePlanned")} value={fmtGs(totals.incomePlannedPyg)} />
      <Stat label={t("ui.budget.incomeActual")} value={fmtGs(totals.incomeActualPyg)} />
    </StatRow>
  );
}

/** Totales y tabla de la campaña, o el vacío con la acción de cargar la primera línea. */
function BudgetBody({ q, newBtn }: { q: ReturnType<typeof useBudget>; newBtn: ReactNode }) {
  const remove = useRemoveLine();
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return null;
  if (q.data.rows.length === 0) {
    return (
      <EmptyState title={t("ui.budget.emptyTitle")} action={newBtn}>
        {t("ui.budget.emptyHint")}
      </EmptyState>
    );
  }
  return (
    <>
      <BudgetTotals totals={q.data.totals} />
      <ExportableTable name="presupuesto">
        <DataTable columns={budgetColumns(remove.mutate)} rows={q.data.rows} rowKey={(r) => r.id} caption={t("ui.admin.section_budget")} />
      </ExportableTable>
    </>
  );
}

/** Presupuesto de campaña frente a lo real. */
export function BudgetPanel() {
  const seasons = useSeasonList();
  const [seasonId, setSeasonId] = useState("");
  const season = seasonId || seasons.data?.find((x) => x.active)?.id || seasons.data?.[0]?.id || "";
  const q = useBudget(season);
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  if (seasons.isLoading) return <Spinner />;
  if ((seasons.data ?? []).length === 0) {
    return (
      <EmptyState title={t("ui.budget.noSeason")} action={<Button variant="primary" onClick={() => navigate({ to: "/" })}>{t("ui.budget.goFarms")}</Button>}>
        {t("ui.budget.noSeasonHint")}
      </EmptyState>
    );
  }
  const newBtn = (
    <Button variant="primary" onClick={() => setAdding(true)}>
      {t("ui.budget.new")}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      {(q.data?.rows.length ?? 0) > 0 && <HeaderActions>{newBtn}</HeaderActions>}
      <FilterBar sheet={false}>
        <Field label={t("ui.cost.season")}>
          <Select value={season} onChange={(e) => setSeasonId(e.target.value)} options={(seasons.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />
        </Field>
      </FilterBar>
      <BudgetBody q={q} newBtn={newBtn} />
      {adding && <LineModal seasonId={season} onClose={() => setAdding(false)} />}
    </div>
  );
}
