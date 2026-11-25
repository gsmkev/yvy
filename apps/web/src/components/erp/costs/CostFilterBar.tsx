/** Barra de filtros de Costos: estancia, campaña, categoría y rango de fechas. */
import { COST_CATEGORIES } from "@yvy/shared";
import { t, tk } from "../../../lib/i18n";
import { useFarms } from "../../../lib/queries";
import { DateRange, Field, FilterBar, Select } from "../../ui";
import { NO_COST_FILTERS, useSeasonList, type CostFilters } from "./useCosts";

/** Filtros de Costos; `f` son los valores y `onChange` recibe los nuevos. */
export function CostFilterBar({ f, onChange }: { f: CostFilters; onChange: (f: CostFilters) => void }) {
  const farms = useFarms();
  const seasons = useSeasonList();
  const all = { value: "", label: t("ui.cost.all") };
  const set = (k: keyof CostFilters) => (e: { target: { value: string } }) => onChange({ ...f, [k]: e.target.value });
  return (
    <FilterBar active={Object.values(f).filter(Boolean).length} onClear={() => onChange(NO_COST_FILTERS)}>
      <Field label={t("ui.cost.farm")}>
        <Select value={f.farmId} onChange={set("farmId")} options={[all, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
      </Field>
      <Field label={t("ui.cost.season")}>
        <Select value={f.seasonId} onChange={set("seasonId")} options={[all, ...(seasons.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
      </Field>
      <Field label={t("ui.cost.category")}>
        <Select value={f.category} onChange={set("category")} options={[all, ...COST_CATEGORIES.map((x) => ({ value: x, label: tk(`ui.cost.category_${x}`) }))]} />
      </Field>
      <DateRange from={f.from} to={f.to} onChange={(r) => onChange({ ...f, ...r })} />
    </FilterBar>
  );
}
