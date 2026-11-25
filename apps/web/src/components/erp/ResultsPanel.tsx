/** Costo por hectárea y por tonelada, y margen bruto por lote, cultivo y actividad. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ResultsResponse as Results } from "@yvy/shared";
import { get, withQs } from "../../lib/api";
import { t } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { useFarms } from "../../lib/queries";
import { ExportableTable } from "../ExportableTable";
import { Button, EmptyState, ErrorBox, Field, FilterBar, Select, Spinner, Stat, StatRow } from "../ui";
import { SectionButton } from "./SectionButton";
import { useSeasonList } from "./costs/useCosts";
import { ResultsTable, Segmented, VIEWS, rowsOf, type View } from "./results/ResultsViews";

type Filters = { farmId: string; seasonId: string };

function ResultsFilters({ f, onChange }: { f: Filters; onChange: (f: Filters) => void }) {
  const farms = useFarms();
  const seasons = useSeasonList();
  const all = { value: "", label: t("ui.cost.all") };
  const set = (k: keyof Filters) => (e: { target: { value: string } }) => onChange({ ...f, [k]: e.target.value });
  return (
    <FilterBar>
      <Field label={t("ui.cost.season")}>
        <Select value={f.seasonId} onChange={set("seasonId")} options={[all, ...(seasons.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
      </Field>
      <Field label={t("ui.cost.farm")}>
        <Select value={f.farmId} onChange={set("farmId")} options={[all, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
      </Field>
    </FilterBar>
  );
}

/** Sin movimientos: el filtro actual no deja nada, o todavía no se cargó nada y se ofrece dónde cargarlo. */
function ResultsEmpty({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <EmptyState
      title={filtered ? t("ui.results.emptyFiltered") : t("ui.results.emptyTitle")}
      action={
        filtered ? (
          <Button onClick={onClear}>{t("ui.cost.clearFilters")}</Button>
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
  );
}

/** Costo, ingreso y margen del total, cada uno con su cifra por hectárea o tonelada. */
function ResultsTotals({ tt }: { tt: Results["totals"] } ) {
  const perHa = (n: number | null) => (n !== null ? t("ui.results.notePerHa", { n: fmtGs(n) }) : undefined);
  const costNote = [perHa(tt.costPerHa), tt.costPerTon !== null ? t("ui.results.notePerTon", { n: fmtGs(tt.costPerTon) }) : undefined].filter(Boolean).join(", ");
  return (
    <StatRow>
      <Stat size="lg" label={t("ui.cost.totalCost")} value={fmtGs(tt.costPyg)} note={costNote || undefined} />
      <Stat size="lg" label={t("ui.cost.totalIncome")} value={fmtGs(tt.incomePyg)} note={perHa(tt.incomePerHa)} />
      <Stat size="lg" label={t("ui.results.margin")} value={fmtGs(tt.marginPyg)} tone={tt.marginPyg < 0 ? "danger" : undefined} note={perHa(tt.marginPerHa)} />
    </StatRow>
  );
}

const hasMoney = (d: Results) => d.totals.costPyg !== 0 || d.totals.incomePyg !== 0 || d.byPlot.some((r) => r.costPyg !== 0 || r.incomePyg !== 0);

/** Costo por hectárea y por tonelada y margen bruto. */
export function ResultsPanel() {
  const [f, setF] = useState<Filters>({ farmId: "", seasonId: "" });
  const [view, setView] = useState<View>("plot");
  const q = useQuery({
    queryKey: ["erp", "results", f],
    queryFn: () => get<Results>(withQs("/org/erp/results", { farmId: f.farmId || undefined, seasonId: f.seasonId || undefined })),
  });
  const d = q.data;
  const filtered = !!(f.farmId || f.seasonId);
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!d) return null;
  const table = <ResultsTable d={d} view={view} />;
  if (!hasMoney(d)) {
    return (
      <div className="flex flex-col gap-4">
        {filtered && <ResultsFilters f={f} onChange={setF} />}
        <ResultsEmpty filtered={filtered} onClear={() => setF({ farmId: "", seasonId: "" })} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <ResultsFilters f={f} onChange={setF} />
      <ResultsTotals tt={d.totals} />
      <Segmented value={view} onChange={setView} />
      {rowsOf(d, view).length > 0 ? <ExportableTable name={t(VIEWS.find((v) => v.id === view)!.label)}>{table}</ExportableTable> : table}
      {d.beef.costPerKgPyg !== null ? (
        <p className="text-sm">{t("ui.results.beefKg", { cost: fmtGs(d.beef.costPerKgPyg), kg: d.beef.kgSold.toLocaleString("es-PY") })}</p>
      ) : (
        <p className="text-meta text-tinta-2">{t("ui.results.beefNote")}</p>
      )}
    </div>
  );
}
