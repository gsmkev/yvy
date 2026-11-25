/** Diálogo para cargar el perfil de costo de una máquina: compra, vida útil, operario y combustible. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CONTRACTOR_SERVICES } from "@yvy/shared";
import { put } from "../../../lib/api";
import { t, tk } from "../../../lib/i18n";
import { Field, Form, FormFooter, Input, Modal, Select, toast } from "../../ui";
import { useMachines } from "../MachinesPanel";

/** Perfil de costo de una máquina. */
export interface Profile {
  machineId: string;
  service: (typeof CONTRACTOR_SERVICES)[number];
  purchasePricePyg: number;
  residualPyg: number;
  lifeHours: number;
  operatorPerHourPyg: number;
  haPerHour: number | null;
  fuelLitersPerHour: number | null;
  fuelPricePyg: number | null;
}

/** Alta y cambio del perfil; `row` es null para uno nuevo. */
export function ProfileModal({ row, onClose }: { row: Profile | null; onClose: () => void }) {
  const machines = useMachines();
  const qc = useQueryClient();
  const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
  const [f, setF] = useState({
    machineId: row?.machineId ?? (machines.data ?? []).find((m) => m.meterKind === "hours")?.id ?? "",
    service: row?.service ?? "spraying",
    purchase: str(row?.purchasePricePyg),
    residual: str(row?.residualPyg),
    life: str(row?.lifeHours),
    operator: str(row?.operatorPerHourPyg),
    haPerHour: str(row?.haPerHour),
    lph: str(row?.fuelLitersPerHour),
    price: str(row?.fuelPricePyg),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const save = useMutation({
    mutationFn: () =>
      put(`/org/erp/machine-costs/${f.machineId}`, {
        service: f.service,
        purchasePricePyg: num(f.purchase) ?? 0,
        residualPyg: num(f.residual) ?? 0,
        lifeHours: num(f.life) ?? 0,
        operatorPerHourPyg: num(f.operator) ?? 0,
        haPerHour: num(f.haPerHour),
        fuelLitersPerHour: num(f.lph),
        fuelPricePyg: num(f.price),
      }),
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  const hours = (machines.data ?? []).filter((m) => m.meterKind === "hours");
  return (
    <Modal title={t("ui.labor.new")} onClose={onClose}>
      <Form onSubmit={() => save.mutate()}>
        <Field label={t("ui.labor.machine")} hint={t("ui.labor.hoursOnly")}>
          <Select value={f.machineId} onChange={set("machineId")} options={hours.map((m) => ({ value: m.id, label: m.name }))} />
        </Field>
        <Field label={t("ui.labor.service")}>
          <Select value={f.service} onChange={set("service")} options={CONTRACTOR_SERVICES.map((k) => ({ value: k, label: tk(`ui.contractor.service_${k}`) }))} />
        </Field>
        <Field label={t("ui.labor.purchase")}>
          <Input type="number" min={0} step="any" value={f.purchase} onChange={set("purchase")} />
        </Field>
        <Field label={t("ui.labor.residual")}>
          <Input type="number" min={0} step="any" value={f.residual} onChange={set("residual")} />
        </Field>
        <Field label={t("ui.labor.life")}>
          <Input type="number" min={0} step="any" value={f.life} onChange={set("life")} />
        </Field>
        <Field label={t("ui.labor.operator")}>
          <Input type="number" min={0} step="any" value={f.operator} onChange={set("operator")} />
        </Field>
        <Field label={t("ui.labor.haPerHour")}>
          <Input type="number" min={0} step="any" value={f.haPerHour} onChange={set("haPerHour")} />
        </Field>
        <Field label={t("ui.labor.lph")} hint={t("ui.labor.lphHint")}>
          <Input type="number" min={0} step="any" value={f.lph} onChange={set("lph")} />
        </Field>
        <Field label={t("ui.labor.price")} hint={t("ui.labor.priceHint")}>
          <Input type="number" min={0} step="any" value={f.price} onChange={set("price")} />
        </Field>
        <FormFooter error={save.error} disabled={save.isPending || !f.machineId} />
      </Form>
    </Modal>
  );
}
