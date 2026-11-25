/** Tipos y columnas de la tabla de presupuesto contra lo real. */
import { t, tk } from "../../../lib/i18n";
import { fmtGs } from "../../../lib/money";
import type { Column } from "../../ui";
import { RowMenu } from "../adminSlot";

/** Línea de presupuesto con lo real y la diferencia. */
interface BudgetRow {
  id: string;
  plotId: string | null;
  plotName: string | null;
  crop: string | null;
  activity: string | null;
  category: string;
  amountPyg: number;
  actualPyg: number;
  diffPyg: number;
  pct: number | null;
}

/** Líneas de la campaña con los totales de costo e ingreso, planeados y reales. */
export interface BudgetCompare {
  rows: BudgetRow[];
  totals: { costPlannedPyg: number; costActualPyg: number; incomePlannedPyg: number; incomeActualPyg: number };
}

function scopeName(r: BudgetRow) {
  if (r.plotId) return r.plotName ?? t("ui.budget.plot");
  return r.crop ? tk(`fields.crop.${r.crop}`) : t("ui.budget.whole");
}

function diffCell(r: BudgetRow) {
  const bad = r.category === "sale" ? r.diffPyg < 0 : r.diffPyg > 0;
  return <span className={bad ? "text-peligro" : ""}>{fmtGs(r.diffPyg)}</span>;
}

/** Columnas del presupuesto; `onRemove` borra una línea. */
export function budgetColumns(onRemove: (id: string) => void): Column<BudgetRow>[] {
  return [
    {
      id: "scope",
      header: t("ui.budget.scope"),
      cell: (r) => (
        <>
          {scopeName(r)}
          {r.activity ? <span className="block text-meta font-normal text-tinta-2">{tk(`ui.activity.${r.activity}`)}</span> : null}
        </>
      ),
    },
    { id: "category", header: t("ui.cost.category"), hideBelow: "sm", cell: (r) => tk(`ui.cost.category_${r.category}`) },
    { id: "planned", header: t("ui.budget.planned"), align: "right", cell: (r) => fmtGs(r.amountPyg) },
    { id: "actual", header: t("ui.budget.actual"), align: "right", hideBelow: "sm", cell: (r) => fmtGs(r.actualPyg) },
    { id: "diff", header: t("ui.budget.diff"), align: "right", hideBelow: "md", cell: diffCell },
    { id: "pct", header: "%", align: "right", hideBelow: "md", cell: (r) => (r.pct === null ? "" : `${r.pct}`) },
    { id: "_a", header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>, align: "right", width: "3rem", cell: (r) => <RowMenu name={r.plotName ?? tk(`ui.cost.category_${r.category}`)} onDelete={() => onRemove(r.id)} /> },
  ];
}
