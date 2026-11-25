/** Diálogo de alta y edición de un movimiento de costo o venta. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ACTIVITIES, COST_CATEGORIES, CURRENCIES, fromMinor, localDate, toMinor, type Currency } from "@yvy/shared";
import { patch, post } from "../../../lib/api";
import { t, tk } from "../../../lib/i18n";
import { useFarm, useFarms } from "../../../lib/queries";
import { Field, Form, FormFooter, Input, Modal, Select, toast } from "../../ui";
import { useParties } from "../PartiesPanel";
import { dayOf, useSeasonList, type CostEntry } from "./useCosts";

type CostForm = {
  date: string;
  activity: string;
  category: string;
  farmId: string;
  plotId: string;
  seasonId: string;
  description: string;
  currency: string;
  amount: string;
  tons: string;
  partyId: string;
};

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

function initialForm(entry: CostEntry | null): CostForm {
  if (!entry) {
    return { date: localDate(Date.now()), activity: "agricultura", category: "other", farmId: "", plotId: "", seasonId: "", description: "", currency: "PYG", amount: "", tons: "", partyId: "" };
  }
  return {
    date: dayOf(entry.occurredAt),
    activity: entry.activity,
    category: entry.category,
    farmId: str(entry.farmId),
    plotId: str(entry.plotId),
    seasonId: str(entry.seasonId),
    description: str(entry.description),
    currency: entry.currency,
    amount: String(fromMinor(entry.amount, entry.currency)),
    tons: str(entry.tons),
    partyId: str(entry.partyId),
  };
}

function costBody(f: CostForm) {
  return {
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
}

function useSaveCost(entry: CostEntry | null, f: CostForm, onClose: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => (entry ? patch(`/org/erp/costs/${entry.id}`, costBody(f)) : post("/org/erp/costs", costBody(f))),
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
}

const options = (rows: { id: string; name: string }[] | undefined, none: { value: string; label: string }) => [
  none,
  ...(rows ?? []).map((x) => ({ value: x.id, label: x.name })),
];

/** Alta y edición de un movimiento; `entry` es null para uno nuevo. */
export function CostModal({ entry, onClose }: { entry: CostEntry | null; onClose: () => void }) {
  const farms = useFarms();
  const seasons = useSeasonList();
  const parties = useParties();
  const [f, setF] = useState(() => initialForm(entry));
  const farm = useFarm(f.farmId, !!f.farmId);
  const save = useSaveCost(entry, f, onClose);
  const set = (k: keyof CostForm) => (e: { target: { value: string } }) =>
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
          <Select value={f.seasonId} onChange={set("seasonId")} options={options(seasons.data, none)} />
        </Field>
        <Field label={t("ui.cost.farm")}>
          <Select value={f.farmId} onChange={set("farmId")} options={options(farms.data, none)} />
        </Field>
        <Field label={t("ui.cost.plot")}>
          <Select value={f.plotId} onChange={set("plotId")} disabled={!f.farmId} options={options(farm.data?.plots, none)} />
        </Field>
        <Field label={t("ui.cost.description")} wide>
          <Input value={f.description} onChange={set("description")} maxLength={200} />
        </Field>
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
          <Select value={f.partyId} onChange={set("partyId")} options={options(parties.data, none)} />
        </Field>
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}
