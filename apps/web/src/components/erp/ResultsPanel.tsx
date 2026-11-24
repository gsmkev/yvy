/** Costo por hectárea y por tonelada, y margen bruto por lote, cultivo y actividad. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get, withQs } from "../../lib/api";
import { fmtHa, fmtNum } from "../../lib/format";
import { t, tk, type MessageKey } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { useFarms } from "../../lib/queries";
import { ExportableTable } from "../ExportableTable";
import { Button, DataTable, EmptyState, ErrorBox, Field, FilterBar, Select, Spinner, Stat, type Column } from "../ui";
import { SectionButton } from "./SectionButton";
import { useSeasonList } from "./CostsPanel";
import type { ResultsFigures as Figures, ResultsResponse as Results } from "@yvy/shared";

const gs = (n: number | null) => (n === null ? "" : fmtGs(n));
const tone = (n: number) => (n < 0 ? "text-peligro" : "");

type View = "plot" | "crop" | "season" | "activity";
const VIEWS: { id: View; label: MessageKey }[] = [
  { id: "plot", label: "ui.results.byPlot" },
  { id: "crop", label: "ui.results.byCrop" },
  { id: "season", label: "ui.results.bySeason" },
  { id: "activity", label: "ui.results.byActivity" },
];

/** Control segmentado: cambia la vista de una sola tabla. */
function Segmented({ value, onChange }: { value: View; onChange: (v: View) => void }) {
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

/** Costo por hectárea y por tonelada y margen bruto. */
export function ResultsPanel() {
  const farms = useFarms();
  const seasons = useSeasonList();
  const [f, setF] = useState({ farmId: "", seasonId: "" });
  const [view, setView] = useState<View>("plot");
  const q = useQuery({
    queryKey: ["erp", "results", f],
    queryFn: () =>
      get<Results>(withQs("/org/erp/results", { farmId: f.farmId || undefined, seasonId: f.seasonId || undefined })),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const d = q.data;
  const filtered = !!(f.farmId || f.seasonId);
  const hasData = !!d && (d.totals.costPyg !== 0 || d.totals.incomePyg !== 0 || d.byPlot.some((r) => r.costPyg !== 0 || r.incomePyg !== 0));
  const filters = (
    <FilterBar>
      <Field label={t("ui.cost.season")}>
        <Select value={f.seasonId} onChange={set("seasonId")} options={[{ value: "", label: t("ui.cost.all") }, ...(seasons.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
      </Field>
      <Field label={t("ui.cost.farm")}>
        <Select value={f.farmId} onChange={set("farmId")} options={[{ value: "", label: t("ui.cost.all") }, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
      </Field>
    </FilterBar>
  );
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!d) return null;
  if (!hasData)
    return (
      <div className="flex flex-col gap-4">
        {filtered && filters}
        <EmptyState
          title={filtered ? t("ui.results.emptyFiltered") : t("ui.results.emptyTitle")}
          action={
            filtered ? (
              <Button onClick={() => setF({ farmId: "", seasonId: "" })}>{t("ui.cost.clearFilters")}</Button>
            ) : (
              <div className="flex flex-wrap gap-2">
                <SectionButton to="purchases" primary>{t("ui.results.goPurchases")}</SectionButton>
                <SectionButton to="orders">{t("ui.results.goOrders")}</SectionButton>
                <SectionButton to="costs">{t("ui.results.goCosts")}</SectionButton>
              </div>
            )
          }
        >
          {filtered ? t("ui.results.emptyFilteredHint") : t("ui.results.emptyHint")}
        </EmptyState>
      </div>
    );
  const tt = d.totals;
  const plotCols: Column<Results["byPlot"][number]>[] = [
    { id: "name", header: t("ui.order.plot"), cell: (r) => r.name ?? t("ui.results.noPlot") },
    { id: "area", header: t("ui.results.area"), align: "right", hideBelow: "sm", cell: (r) => (r.plotId ? fmtHa(r.areaHa) : "") },
    ...money<Results["byPlot"][number]>(),
    ...perHa<Results["byPlot"][number]>(),
    { id: "tons", header: t("ui.results.tons"), align: "right", hideBelow: "lg", cell: (r) => (r.tons ? fmtNum(r.tons) : "") },
    { id: "costTon", header: t("ui.results.colCostTon"), align: "right", hideBelow: "lg", cell: (r) => gs(r.costPerTon) },
  ];
  const cropCols: Column<Results["byCrop"][number]>[] = [
    { id: "name", header: t("ui.budget.crop"), cell: (r) => (r.crop ? tk(`ui.crop.name_${r.crop}`) : t("ui.dash.noCrop")) },
    { id: "area", header: t("ui.results.area"), align: "right", hideBelow: "sm", cell: (r) => fmtHa(r.areaHa) },
    ...money<Results["byCrop"][number]>(),
    ...perHa<Results["byCrop"][number]>(),
  ];
  const seasonCols: Column<Results["bySeason"][number]>[] = [
    { id: "name", header: t("ui.cost.season"), cell: (r) => r.name ?? t("ui.results.noSeason") },
    ...money<Results["bySeason"][number]>(),
  ];
  const activityCols: Column<Results["byActivity"][number]>[] = [
    { id: "name", header: t("ui.cost.activity"), cell: (r) => tk(`ui.activity.${r.activity}`) },
    ...money<Results["byActivity"][number]>(),
  ];
  const none = <EmptyState compact title={t("ui.results.emptyView")} />;
  const table = (() => {
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
  })();
  const rowsInView = { plot: d.byPlot, crop: d.byCrop, season: d.bySeason, activity: d.byActivity }[view].length;
  return (
    <div className="flex flex-col gap-5">
      {filters}
      <div className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-3">
        <Stat
          size="lg"
          label={t("ui.cost.totalCost")}
          value={fmtGs(tt.costPyg)}
          note={[tt.costPerHa !== null && t("ui.results.notePerHa", { n: fmtGs(tt.costPerHa) }), tt.costPerTon !== null && t("ui.results.notePerTon", { n: fmtGs(tt.costPerTon) })].filter(Boolean).join(" · ") || undefined}
        />
        <Stat
          size="lg"
          label={t("ui.cost.totalIncome")}
          value={fmtGs(tt.incomePyg)}
          note={tt.incomePerHa !== null ? t("ui.results.notePerHa", { n: fmtGs(tt.incomePerHa) }) : undefined}
        />
        <Stat
          size="lg"
          label={t("ui.results.margin")}
          value={fmtGs(tt.marginPyg)}
          tone={tt.marginPyg < 0 ? "danger" : undefined}
          note={tt.marginPerHa !== null ? t("ui.results.notePerHa", { n: fmtGs(tt.marginPerHa) }) : undefined}
        />
      </div>
      <Segmented value={view} onChange={setView} />
      {rowsInView > 0 ? <ExportableTable name={t(VIEWS.find((v) => v.id === view)!.label)}>{table}</ExportableTable> : table}
      {d.beef.costPerKgPyg !== null ? (
        <p className="text-sm">{t("ui.results.beefKg", { cost: fmtGs(d.beef.costPerKgPyg), kg: d.beef.kgSold.toLocaleString("es-PY") })}</p>
      ) : (
        <p className="text-meta text-tinta-2">{t("ui.results.beefNote")}</p>
      )}
    </div>
  );
}
