/** Costos y ventas con centro de costo: estancia, lote, campaña y actividad (E-05). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ACTIVITIES, COST_CATEGORIES, CURRENCIES, fromMinor, localDate, toMinor, type Activity, type CostCategory, type Currency } from "@yvy/shared";
import { del, get, patch, post, qs } from "../../lib/api";
import { fmtIsoDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs, fmtMoney } from "../../lib/money";
import { useFarm, useFarms } from "../../lib/queries";
import type { Season } from "../../lib/types";
import {
  Button,
  ConfirmModal,
  Empty,
  ErrorBox,
  Field,
  FormActions,
  Input,
  Modal,
  Select,
  Spinner,
  Stat,
  toast,
} from "../ui";
import { PhotoRowMenu } from "./InvoicePhoto";
import { HeaderActions } from "./adminSlot";
import { useParties } from "./PartiesPanel";
import { ExportableTable } from "../ExportableTable";

export interface CostEntry {
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

export const useSeasonList = () =>
  useQuery({ queryKey: ["erp", "seasons"], queryFn: async () => (await get<{ seasons: Season[] }>("/org/seasons")).seasons });

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function CostsPanel() {
  const farms = useFarms();
  const seasons = useSeasonList();
  const [f, setF] = useState({ farmId: "", seasonId: "", category: "", from: "", to: "" });
  const [editing, setEditing] = useState<CostEntry | "new" | null>(null);
  const [removing, setRemoving] = useState<CostEntry | null>(null);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["erp", "costs", f],
    queryFn: () => get<CostList>(`/org/erp/costs${qs({ farmId: f.farmId || undefined, seasonId: f.seasonId || undefined, category: f.category || undefined, from: f.from || undefined, to: f.to || undefined })}`),
  });
  const farmName = (id: string | null) => farms.data?.find((x) => x.id === id)?.name ?? "";
  const remove = useMutation({
    mutationFn: (c: CostEntry) => del(`/org/erp/costs/${c.id}`),
    onSuccess: () => {
      toast(t("ui.erpDeleted"));
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const totals = q.data?.totals;
  return (
    <div className="flex flex-col gap-4">
      <HeaderActions>
        <Button variant="primary" onClick={() => setEditing("new")}>
          {t("ui.costNew")}
        </Button>
      </HeaderActions>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("ui.costFarm")}>
          <Select value={f.farmId} onChange={set("farmId")} options={[{ value: "", label: t("ui.costAll") }, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
        <Field label={t("ui.costSeason")}>
          <Select value={f.seasonId} onChange={set("seasonId")} options={[{ value: "", label: t("ui.costAll") }, ...(seasons.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
        <Field label={t("ui.costCategory")}>
          <Select value={f.category} onChange={set("category")} options={[{ value: "", label: t("ui.costAll") }, ...COST_CATEGORIES.map((x) => ({ value: x, label: tk(`ui.costCategory_${x}`) }))]} />
        </Field>
        <Field label={t("ui.costFrom")}>
          <Input type="date" value={f.from} onChange={set("from")} />
        </Field>
        <Field label={t("ui.costTo")}>
          <Input type="date" value={f.to} onChange={set("to")} />
        </Field>
      </div>
      {totals && (
        <div className="flex flex-wrap gap-8">
          <Stat label={t("ui.costTotalCost")} value={fmtGs(totals.costPyg)} />
          <Stat label={t("ui.costTotalIncome")} value={fmtGs(totals.incomePyg)} />
          <Stat label={t("ui.costResult")} value={fmtGs(totals.incomePyg - totals.costPyg)} tone={totals.incomePyg - totals.costPyg < 0 ? "danger" : undefined} />
        </div>
      )}
      {q.isLoading && <Spinner />}
      {q.error ? <ErrorBox error={q.error} /> : null}
      {q.data && q.data.rows.length === 0 && <Empty>{t("ui.erpEmpty")}</Empty>}
      {q.data && q.data.rows.length > 0 && (
        <div className="overflow-x-auto">
          <ExportableTable name="costos">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-linea text-left text-tinta-2">
                  <th className="py-2 pr-4 font-medium">{t("ui.costDate")}</th>
                  <th className="py-2 pr-4 font-medium">{t("ui.costCategory")}</th>
                  <th className="py-2 pr-4 font-medium">{t("ui.costActivity")}</th>
                  <th className="py-2 pr-4 font-medium">{t("ui.costDescription")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.costAmount")}</th>
                  <th className="sticky right-0 w-12 bg-lino">
                    <span className="sr-only">{t("ui.rowActionsHeader")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((c) => (
                  <tr key={c.id} className="border-b border-linea">
                    <td className="num py-2.5 pr-4 whitespace-nowrap">{fmtIsoDate(dayOf(c.occurredAt))}</td>
                    <td className="py-2.5 pr-4">{tk(`ui.costCategory_${c.category}`)}</td>
                    <td className="py-2.5 pr-4">{tk(`ui.activity_${c.activity}`)}</td>
                    <td className="py-2.5 pr-4">
                      {c.description}
                      <span className="block text-xs text-tinta-2">{[farmName(c.farmId), c.origin !== "manual" ? t("ui.costFromRecord") : ""].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className={`num py-2.5 pr-4 text-right ${c.category === "sale" ? "text-accion" : ""}`}>
                      {c.category === "sale" ? "" : "-"}
                      {fmtMoney(c.amount, c.currency)}
                      {c.currency !== "PYG" && <span className="block text-xs text-tinta-2">{fmtGs(c.amountPyg)}</span>}
                    </td>
                    <td className="sticky right-0 w-12 bg-lino py-1 text-right">
                      <PhotoRowMenu
                        kind="cost-entries"
                        id={c.id}
                        hasPhoto={!!c.photoPath}
                        name={c.description ?? tk(`ui.costCategory_${c.category}`)}
                        onEdit={c.origin === "manual" ? () => setEditing(c) : undefined}
                        onDelete={c.origin === "manual" ? () => setRemoving(c) : undefined}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ExportableTable>
        </div>
      )}
      {editing && <CostModal entry={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmModal
          title={removing.description ?? tk(`ui.costCategory_${removing.category}`)}
          message={t("ui.erpDeleteConfirm", { name: removing.description ?? tk(`ui.costCategory_${removing.category}`) })}
          confirmLabel={t("ui.delete")}
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
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value, ...(k === "farmId" ? { plotId: "" } : {}) });
  const none = { value: "", label: t("ui.costNone") };
  return (
    <Modal title={entry ? t("ui.costEdit") : t("ui.costNew")} onClose={onClose}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.costDate")}>
          <Input type="date" required value={f.date} onChange={set("date")} />
        </Field>
        <Field label={t("ui.costCategory")}>
          <Select value={f.category} onChange={set("category")} options={COST_CATEGORIES.map((x) => ({ value: x, label: tk(`ui.costCategory_${x}`) }))} />
        </Field>
        <Field label={t("ui.costActivity")}>
          <Select value={f.activity} onChange={set("activity")} options={ACTIVITIES.map((x) => ({ value: x, label: tk(`ui.activity_${x}`) }))} />
        </Field>
        <Field label={t("ui.costSeason")}>
          <Select value={f.seasonId} onChange={set("seasonId")} options={[none, ...(seasons.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
        <Field label={t("ui.costFarm")}>
          <Select value={f.farmId} onChange={set("farmId")} options={[none, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
        <Field label={t("ui.costPlot")}>
          <Select value={f.plotId} onChange={set("plotId")} disabled={!f.farmId} options={[none, ...(farm.data?.plots ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
        <div className="col-span-2">
          <Field label={t("ui.costDescription")}>
            <Input value={f.description} onChange={set("description")} maxLength={200} />
          </Field>
        </div>
        <Field label={t("ui.currency")}>
          <Select value={f.currency} onChange={set("currency")} options={CURRENCIES.map((x) => ({ value: x, label: x }))} />
        </Field>
        <Field label={t("ui.costAmount")}>
          <Input type="number" required min={0} step="any" value={f.amount} onChange={set("amount")} />
        </Field>
        {f.category === "sale" && (
          <Field label={t("ui.costTons")}>
            <Input type="number" min={0} step="any" value={f.tons} onChange={set("tons")} />
          </Field>
        )}
        <Field label={t("ui.costParty")}>
          <Select value={f.partyId} onChange={set("partyId")} options={[none, ...(parties.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
        {save.error ? (
          <div className="col-span-2">
            <ErrorBox error={save.error} />
          </div>
        ) : null}
        <FormActions className="col-span-2" onCancel={onClose} disabled={save.isPending} />
      </form>
    </Modal>
  );
}
