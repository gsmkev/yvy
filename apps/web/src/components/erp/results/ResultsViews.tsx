/** Tabla de resultados según la vista elegida (lote, cultivo, campaña o actividad) y su control segmentado. */
import type { ResultsFigures as Figures, ResultsResponse as Results } from "@yvy/shared";
import { fmtHa, fmtNum } from "../../../lib/format";
import { t, tk, type MessageKey } from "../../../lib/i18n";
import { fmtGs } from "../../../lib/money";
import { DataTable, EmptyState, type Column } from "../../ui";

/** Vistas de la tabla de resultados. */
export type View = "plot" | "crop" | "season" | "activity";

/** Vistas con el texto de su botón. */
export const VIEWS: { id: View; label: MessageKey }[] = [
  { id: "plot", label: "ui.results.byPlot" },
  { id: "crop", label: "ui.results.byCrop" },
  { id: "season", label: "ui.results.bySeason" },
  { id: "activity", label: "ui.results.byActivity" },
];

const gs = (n: number | null) => (n === null ? "" : fmtGs(n));
const tone = (n: number) => (n < 0 ? "text-peligro" : "");

/** Control segmentado: cambia la vista de una sola tabla. */
export function Segmented({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  return (
    <div role="group" aria-label={t("ui.results.viewBy")} className="inline-flex max-w-full self-start overflow-x-auto rounded-md border border-linea p-0.5">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          aria-pressed={value === v.id}
          onClick={() => onChange(v.id)}
          className={`h-8 shrink-0 cursor-pointer rounded px-3 text-sm font-medium whitespace-nowrap transition-colors ${value === v.id ? "bg-surco text-lino" : "text-tinta-2 hover:text-surco"}`}
        >
          {t(v.label)}
        </button>
      ))}
    </div>
  );
}

const money = <T extends { costPyg: number; incomePyg: number; marginPyg: number }>(): Column<T>[] => [
  { id: "cost", header: t("ui.cost.totalCost"), align: "right", cell: (r) => fmtGs(r.costPyg) },
  { id: "income", header: t("ui.cost.totalIncome"), align: "right", cell: (r) => fmtGs(r.incomePyg) },
  { id: "margin", header: t("ui.results.margin"), align: "right", cell: (r) => <span className={tone(r.marginPyg)}>{fmtGs(r.marginPyg)}</span> },
];

const perHa = <T extends Figures>(): Column<T>[] => [
  { id: "costHa", header: t("ui.results.colCostHa"), align: "right", hideBelow: "lg", cell: (r) => gs(r.costPerHa) },
  { id: "incomeHa", header: t("ui.results.colIncomeHa"), align: "right", hideBelow: "lg", cell: (r) => gs(r.incomePerHa) },
  { id: "marginHa", header: t("ui.results.colMarginHa"), align: "right", hideBelow: "md", cell: (r) => <span className={tone(r.marginPerHa ?? 0)}>{gs(r.marginPerHa)}</span> },
];

type PlotRow = Results["byPlot"][number];
type CropRow = Results["byCrop"][number];
type SeasonRow = Results["bySeason"][number];
type ActivityRow = Results["byActivity"][number];

const plotCols: Column<PlotRow>[] = [
  { id: "name", header: t("ui.order.plot"), cell: (r) => r.name ?? t("ui.results.noPlot") },
  { id: "area", header: t("ui.results.area"), align: "right", hideBelow: "sm", cell: (r) => (r.plotId ? fmtHa(r.areaHa) : "") },
  ...money<PlotRow>(),
  ...perHa<PlotRow>(),
  { id: "tons", header: t("ui.results.tons"), align: "right", hideBelow: "lg", cell: (r) => (r.tons ? fmtNum(r.tons) : "") },
  { id: "costTon", header: t("ui.results.colCostTon"), align: "right", hideBelow: "lg", cell: (r) => gs(r.costPerTon) },
];

const cropCols: Column<CropRow>[] = [
  { id: "name", header: t("ui.budget.crop"), cell: (r) => (r.crop ? tk(`ui.crop.name_${r.crop}`) : t("ui.dash.noCrop")) },
  { id: "area", header: t("ui.results.area"), align: "right", hideBelow: "sm", cell: (r) => fmtHa(r.areaHa) },
  ...money<CropRow>(),
  ...perHa<CropRow>(),
];

const seasonCols: Column<SeasonRow>[] = [{ id: "name", header: t("ui.cost.season"), cell: (r) => r.name ?? t("ui.results.noSeason") }, ...money<SeasonRow>()];

const activityCols: Column<ActivityRow>[] = [{ id: "name", header: t("ui.cost.activity"), cell: (r) => tk(`ui.activity.${r.activity}`) }, ...money<ActivityRow>()];

/** Filas de la vista elegida. */
export const rowsOf = (d: Results, view: View): unknown[] => ({ plot: d.byPlot, crop: d.byCrop, season: d.bySeason, activity: d.byActivity })[view];

/** La tabla de la vista elegida. */
export function ResultsTable({ d, view }: { d: Results; view: View }) {
  const none = <EmptyState compact title={t("ui.results.emptyView")} />;
  switch (view) {
    case "plot":
      return <DataTable columns={plotCols} rows={d.byPlot} rowKey={(r) => r.plotId ?? "none"} empty={none} caption={t("ui.results.byPlot")} />;
    case "crop":
      return <DataTable columns={cropCols} rows={d.byCrop} rowKey={(r) => r.crop ?? "none"} empty={none} caption={t("ui.results.byCrop")} />;
    case "season":
      return <DataTable columns={seasonCols} rows={d.bySeason} rowKey={(r) => r.seasonId ?? "none"} empty={none} caption={t("ui.results.bySeason")} />;
    case "activity":
      return <DataTable columns={activityCols} rows={d.byActivity} rowKey={(r) => r.activity} empty={none} caption={t("ui.results.byActivity")} />;
  }
}
