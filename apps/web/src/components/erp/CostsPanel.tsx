/** Costos y ventas con centro de costo: estancia, lote, campaña y actividad. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ACTIVITIES,
  COST_CATEGORIES,
  CURRENCIES,
  fromMinor,
  localDate,
  toMinor,
  type Activity,
  type CostCategory,
  type Currency,
} from "@yvy/shared";
import { del, get, patch, post, withQs } from "../../lib/api";
import { fmtIsoDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs, fmtMoney } from "../../lib/money";
import { useFarm, useFarms } from "../../lib/queries";
import type { Season } from "../../lib/types";
import { Button, type Column, ConfirmModal, DataTable, EmptyState, ErrorBox, DateRange, Field, FilterBar, Form, FormFooter, Input, Modal, Select, Spinner, Stat, StatRow, toast } from "../ui";
import { PhotoRowMenu } from "./InvoicePhoto";
import { HeaderActions } from "./adminSlot";
import { useParties } from "./PartiesPanel";
import { ExportableTable } from "../ExportableTable";

interface CostEntry {
  id: string;
  occurredAt: number;
  farmId: string | null;
  plotId: string | null;
  seasonId: string | null;
  activity: Activity;
  category: CostCategory;
  description: string | null;
  amount: number;
  currency: Currency;
  amountPyg: number;
  tons: number | null;
  partyId: string | null;
  origin: string;
  photoPath: string | null;
}

interface CostList {
  rows: CostEntry[];
  totals: { costPyg: number; incomePyg: number };
}

/** Campañas de la organización para elegir el centro de costo. */
export const useSeasonList = () =>
  useQuery({ queryKey: ["erp", "seasons"], queryFn: async () => (await get<{ seasons: Season[] }>("/org/seasons")).seasons });

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function costColumns(farmName: (id: string | null) => string, onEdit: (c: CostEntry) => void, onRemove: (c: CostEntry) => void): Column<CostEntry>[] {
  return [
    { id: "date", header: t("ui.cost.date"), cell: (c) => <span className="whitespace-nowrap">{fmtIsoDate(dayOf(c.occurredAt))}</span> },
    { id: "category", header: t("ui.cost.category"), hideBelow: "md", cell: (c) => tk(`ui.cost.category_${c.category}`) },
    { id: "activity", header: t("ui.cost.activity"), hideBelow: "lg", cell: (c) => tk(`ui.activity.${c.activity}`) },
    {
      id: "description",
      header: t("ui.cost.description"),
      cell: (c) => (
        <>
          {c.description ?? <span className="md:hidden">{tk(`ui.cost.category_${c.category}`)}</span>}
          <span className="block text-meta text-tinta-2">{[farmName(c.farmId), c.origin !== "manual" ? t("ui.cost.fromRecord") : ""].filter(Boolean).join(" · ")}</span>
        </>
      ),
    },
    {
      id: "amount",
      header: t("ui.cost.amount"),
      align: "right",
      cell: (c) => (
        <span className={c.category === "sale" ? "text-accion" : ""}>
          {c.category === "sale" ? "" : "-"}
          {fmtMoney(c.amount, c.currency)}
          {c.currency !== "PYG" && <span className="block text-meta text-tinta-2">{fmtGs(c.amountPyg)}</span>}
        </span>
      ),
    },
    {
      id: "_actions",
      header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
      align: "right",
      width: "3rem",
      cell: (c) => (
        <PhotoRowMenu
          kind="cost-entries"
          id={c.id}
          hasPhoto={!!c.photoPath}
          name={c.description ?? tk(`ui.cost.category_${c.category}`)}
          onEdit={c.origin === "manual" ? () => onEdit(c) : undefined}
          onDelete={c.origin === "manual" ? () => onRemove(c) : undefined}
        />
      ),
    },
  ];
}

/** Costos y ventas con su centro de costo. */
export function CostsPanel() {
  const farms = useFarms();
  const seasons = useSeasonList();
  const [f, setF] = useState({ farmId: "", seasonId: "", category: "", from: "", to: "" });
  const [editing, setEditing] = useState<CostEntry | "new" | null>(null);
  const [removing, setRemoving] = useState<CostEntry | null>(null);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["erp", "costs", f],
    queryFn: () =>
      get<CostList>(
        withQs("/org/erp/costs", {
          farmId: f.farmId || undefined,
          seasonId: f.seasonId || undefined,
          category: f.category || undefined,
          from: f.from || undefined,
          to: f.to || undefined,
        }),
      ),
  });
  const farmName = (id: string | null) => farms.data?.find((x) => x.id === id)?.name ?? "";
  const remove = useMutation({
    mutationFn: (c: CostEntry) => del(`/org/erp/costs/${c.id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const totals = q.data?.totals;
  const rows = q.data?.rows ?? [];
  const filtered = Object.values(f).some(Boolean);
  const blank = !!q.data && rows.length === 0 && !filtered;
  const newBtn = (
    <Button variant="primary" onClick={() => setEditing("new")}>
      {t("ui.cost.new")}
    </Button>
  );
  const columns = costColumns(farmName, setEditing, setRemoving);
  return (
    <div className="flex flex-col gap-4">
      {!blank && <HeaderActions>{newBtn}</HeaderActions>}
      {!blank && (
        <FilterBar active={Object.values(f).filter(Boolean).length} onClear={() => setF({ farmId: "", seasonId: "", category: "", from: "", to: "" })}>
          <Field label={t("ui.cost.farm")}>
            <Select value={f.farmId} onChange={set("farmId")} options={[{ value: "", label: t("ui.cost.all") }, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
          </Field>
          <Field label={t("ui.cost.season")}>
            <Select value={f.seasonId} onChange={set("seasonId")} options={[{ value: "", label: t("ui.cost.all") }, ...(seasons.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
          </Field>
          <Field label={t("ui.cost.category")}>
            <Select value={f.category} onChange={set("category")} options={[{ value: "", label: t("ui.cost.all") }, ...COST_CATEGORIES.map((x) => ({ value: x, label: tk(`ui.cost.category_${x}`) }))]} />
          </Field>
          <DateRange from={f.from} to={f.to} onChange={(r) => setF({ ...f, ...r })} />
        </FilterBar>
      )}
      {totals && rows.length > 0 && (
        <StatRow>
          <Stat label={t("ui.cost.totalCost")} value={fmtGs(totals.costPyg)} />
          <Stat label={t("ui.cost.totalIncome")} value={fmtGs(totals.incomePyg)} />
          <Stat label={t("ui.cost.result")} value={fmtGs(totals.incomePyg - totals.costPyg)} tone={totals.incomePyg - totals.costPyg < 0 ? "danger" : undefined} />
        </StatRow>
      )}
      {q.isLoading && <Spinner />}
      {q.error ? <ErrorBox error={q.error} /> : null}
      {blank && (
        <EmptyState title={t("ui.cost.emptyTitle")} action={newBtn}>
          {t("ui.cost.emptyHint")}
        </EmptyState>
      )}
      {q.data && rows.length === 0 && filtered && (
        <EmptyState
          title={t("ui.cost.emptyFiltered")}
          action={
            <Button onClick={() => setF({ farmId: "", seasonId: "", category: "", from: "", to: "" })}>{t("ui.cost.clearFilters")}</Button>
          }
        />
      )}
      {rows.length > 0 && (
        <ExportableTable name="costos">
          <DataTable columns={columns} rows={rows} rowKey={(c) => c.id} />
        </ExportableTable>
      )}
      {editing && <CostModal entry={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmModal
          title={removing.description ?? tk(`ui.cost.category_${removing.category}`)}
          message={t("ui.erp.deleteConfirm", { name: removing.description ?? tk(`ui.cost.category_${removing.category}`) })}
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

function CostModal({ entry, onClose }: { entry: CostEntry | null; onClose: () => void }) {
  const qc = useQueryClient();
  const farms = useFarms();
  const seasons = useSeasonList();
  const parties = useParties();
  const [f, setF] = useState({
    date: entry ? dayOf(entry.occurredAt) : localDate(Date.now()),
    activity: entry?.activity ?? "agricultura",
    category: entry?.category ?? "other",
    farmId: entry?.farmId ?? "",
    plotId: entry?.plotId ?? "",
    seasonId: entry?.seasonId ?? "",
    description: entry?.description ?? "",
    currency: entry?.currency ?? "PYG",
    amount: entry ? String(fromMinor(entry.amount, entry.currency)) : "",
    tons: entry?.tons?.toString() ?? "",
    partyId: entry?.partyId ?? "",
  });
  const farm = useFarm(f.farmId, !!f.farmId);
  const save = useMutation({
    mutationFn: () => {
      const body = {
        date: f.date,
        activity: f.activity,
        category: f.category,
        farmId: f.farmId || null,
        plotId: f.plotId || null,
        seasonId: f.seasonId || null,
        description: f.description.trim() || null,
        currency: f.currency,
        amount: toMinor(Number(f.amount), f.currency as Currency),
        partyId: f.partyId || null,
        tons: f.category === "sale" && f.tons ? Number(f.tons) : null,
      };
      return entry ? patch(`/org/erp/costs/${entry.id}`, body) : post("/org/erp/costs", body);
    },
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value, ...(k === "farmId" ? { plotId: "" } : {}) });
  const none = { value: "", label: t("ui.cost.none") };
  return (
    <Modal title={entry ? t("ui.cost.edit") : t("ui.cost.new")} onClose={onClose}>
      <Form onSubmit={() => save.mutate()}>
        <Field label={t("ui.cost.date")}>
          <Input type="date" required value={f.date} onChange={set("date")} />
        </Field>
        <Field label={t("ui.cost.category")}>
          <Select value={f.category} onChange={set("category")} options={COST_CATEGORIES.map((x) => ({ value: x, label: tk(`ui.cost.category_${x}`) }))} />
        </Field>
        <Field label={t("ui.cost.activity")}>
          <Select value={f.activity} onChange={set("activity")} options={ACTIVITIES.map((x) => ({ value: x, label: tk(`ui.activity.${x}`) }))} />
        </Field>
        <Field label={t("ui.cost.season")}>
          <Select value={f.seasonId} onChange={set("seasonId")} options={[none, ...(seasons.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
        <Field label={t("ui.cost.farm")}>
          <Select value={f.farmId} onChange={set("farmId")} options={[none, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
        <Field label={t("ui.cost.plot")}>
          <Select value={f.plotId} onChange={set("plotId")} disabled={!f.farmId} options={[none, ...(farm.data?.plots ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("ui.cost.description")}>
            <Input value={f.description} onChange={set("description")} maxLength={200} />
          </Field>
        </div>
        <Field label={t("ui.common.currency")}>
          <Select value={f.currency} onChange={set("currency")} options={CURRENCIES.map((x) => ({ value: x, label: x }))} />
        </Field>
        <Field label={t("ui.cost.amount")}>
          <Input type="number" required min={0} step="any" value={f.amount} onChange={set("amount")} />
        </Field>
        {f.category === "sale" && (
          <Field label={t("ui.cost.tons")}>
            <Input type="number" min={0} step="any" value={f.tons} onChange={set("tons")} />
          </Field>
        )}
        <Field label={t("ui.cost.party")}>
          <Select value={f.partyId} onChange={set("partyId")} options={[none, ...(parties.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}
