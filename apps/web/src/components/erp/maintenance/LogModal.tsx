/** Diálogo para registrar un servicio o una reparación de una máquina. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CURRENCIES, MAINTENANCE_KINDS, localDate, toMinor, type Currency, type MaintenancePlanRow as Plan } from "@yvy/shared";
import { post } from "../../../lib/api";
import { t, tk } from "../../../lib/i18n";
import { Field, Form, FormFooter, Input, Modal, Select, toast } from "../../ui";
import { useMachines } from "../MachinesPanel";
import { useParties } from "../PartiesPanel";

type LogForm = {
  machineId: string;
  planId: string;
  kind: string;
  date: string;
  meter: string;
  description: string;
  partyId: string;
  amount: string;
  currency: Currency;
};

const optNum = (v: string) => (v === "" ? null : Number(v));

function logBody(f: LogForm) {
  return {
    machineId: f.machineId,
    planId: f.planId || null,
    kind: f.kind,
    date: f.date,
    meterValue: optNum(f.meter),
    description: f.description.trim() || null,
    partyId: f.partyId || null,
    amount: f.amount === "" ? null : toMinor(Number(f.amount), f.currency),
    currency: f.amount === "" ? null : f.currency,
  };
}

/** Alta de un servicio; `planId` es el plan que se cumple o null si es una reparación suelta. */
export function LogModal({ planId, plans, onClose }: { planId: string | null; plans: Plan[]; onClose: () => void }) {
  const machines = useMachines();
  const parties = useParties();
  const qc = useQueryClient();
  const plan = plans.find((p) => p.id === planId);
  const [f, setF] = useState<LogForm>({
    machineId: plan?.machineId ?? machines.data?.[0]?.id ?? "",
    planId: planId ?? "",
    kind: planId ? "preventive" : "repair",
    date: localDate(Date.now()),
    meter: "",
    description: plan?.name ?? "",
    partyId: "",
    amount: "",
    currency: "PYG",
  });
  const save = useMutation({
    mutationFn: () => post("/org/erp/maintenance/logs", logBody(f)),
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  const set = (k: keyof LogForm) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const ofMachine = plans.filter((p) => p.machineId === f.machineId);
  return (
    <Modal title={t("ui.maint.logNew")} onClose={onClose}>
      <Form onSubmit={() => save.mutate()}>
        <Field label={t("ui.maint.machine")}>
          <Select value={f.machineId} onChange={(e) => setF({ ...f, machineId: e.target.value, planId: "" })} options={(machines.data ?? []).map((m) => ({ value: m.id, label: m.name }))} />
        </Field>
        <Field label={t("ui.maint.kind")}>
          <Select value={f.kind} onChange={set("kind")} options={MAINTENANCE_KINDS.map((k) => ({ value: k, label: tk(`ui.maint.kind_${k}`) }))} />
        </Field>
        <Field label={t("ui.maint.planName")} wide>
          <Select value={f.planId} onChange={set("planId")} options={[{ value: "", label: t("ui.maint.noPlan") }, ...ofMachine.map((p) => ({ value: p.id, label: p.name }))]} />
        </Field>
        <Field label={t("ui.cost.date")}>
          <Input required type="date" value={f.date} onChange={set("date")} />
        </Field>
        <Field label={t("ui.maint.meter")}>
          <Input type="number" min={0} step="any" value={f.meter} onChange={set("meter")} />
        </Field>
        <Field label={t("ui.maint.description")} wide>
          <Input maxLength={300} value={f.description} onChange={set("description")} />
        </Field>
        <Field label={t("ui.maint.workshop")} wide>
          <Select value={f.partyId} onChange={set("partyId")} options={[{ value: "", label: "—" }, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
        </Field>
        <Field label={t("ui.maint.cost")}>
          <Input type="number" min={0} step="any" value={f.amount} onChange={set("amount")} />
        </Field>
        <Field label={t("ui.common.currency")}>
          <Select value={f.currency} onChange={set("currency")} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </Field>
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}
