/** Diálogo para registrar una entrega o una liquidación de un contrato de granos. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { localDate, toMinor } from "@yvy/shared";
import { post } from "../../../lib/api";
import { t } from "../../../lib/i18n";
import { useFarms } from "../../../lib/queries";
import { Field, Form, FormFooter, Input, Modal, Select, toast } from "../../ui";
import type { Contract } from "./useGrainData";

type Kind = "delivery" | "settlement";
type GrainForm = { date: string; tons: string; ticket: string; moisture: string; deductions: string; due: string; farmId: string };

const optNum = (v: string) => (v === "" ? null : Number(v));

function saveRequest(kind: Kind, contract: Contract, f: GrainForm, onlyFarm: string | null) {
  const base = { contractId: contract.id, date: f.date, tons: Number(f.tons) };
  if (kind === "delivery") {
    return post("/org/erp/grain-deliveries", { ...base, farmId: f.farmId || onlyFarm, ticket: f.ticket || null, moisturePct: optNum(f.moisture) });
  }
  const deductions = optNum(f.deductions);
  return post("/org/erp/grain-settlements", {
    ...base,
    number: f.ticket || null,
    deductionsMinor: deductions === null ? null : toMinor(deductions, contract.currency),
    dueDate: f.due || null,
  });
}

function DeliveryFields({ f, set, farms }: { f: GrainForm; set: (k: keyof GrainForm) => (e: { target: { value: string } }) => void; farms: { id: string; name: string }[] }) {
  return (
    <>
      <Field label={t("ui.grain.moisture")}>
        <Input type="number" min={0} max={100} step="any" value={f.moisture} onChange={set("moisture")} />
      </Field>
      {farms.length > 1 && (
        <Field label={t("ui.common.farm")}>
          <Select required value={f.farmId} onChange={set("farmId")} options={[{ value: "", label: "—" }, ...farms.map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
      )}
    </>
  );
}

function SettlementFields({ f, set }: { f: GrainForm; set: (k: keyof GrainForm) => (e: { target: { value: string } }) => void }) {
  return (
    <>
      <Field label={t("ui.grain.deductions")}>
        <Input type="number" min={0} step="any" value={f.deductions} onChange={set("deductions")} />
      </Field>
      <Field label={t("ui.purch.dueLabel")}>
        <Input type="date" value={f.due} onChange={set("due")} />
      </Field>
    </>
  );
}

/** Alta de una entrega (con ticket y humedad) o de una liquidación (con descuentos y vencimiento) del contrato. */
export function GrainActionModal({ kind, contract, onClose }: { kind: Kind; contract: Contract; onClose: () => void }) {
  const qc = useQueryClient();
  const farms = useFarms();
  const [f, setF] = useState<GrainForm>({
    date: localDate(Date.now()),
    tons: kind === "delivery" ? "" : String(contract.toSettleTons || ""),
    ticket: "",
    moisture: "",
    deductions: "",
    due: "",
    farmId: "",
  });
  const set = (k: keyof GrainForm) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  // La entrega se registra en la estancia: con varias hay que elegir cuál
  const farmList = farms.data ?? [];
  const save = useMutation({
    mutationFn: () => saveRequest(kind, contract, f, farmList.length === 1 ? farmList[0]!.id : null),
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  return (
    <Modal title={kind === "delivery" ? t("ui.grain.addDelivery") : t("ui.grain.addSettlement")} onClose={onClose}>
      <Form onSubmit={() => save.mutate()}>
        <Field label={t("ui.cost.date")}>
          <Input required type="date" value={f.date} onChange={set("date")} />
        </Field>
        <Field label={t("ui.grain.tons")}>
          <Input required type="number" min={0} step="any" value={f.tons} onChange={set("tons")} />
        </Field>
        <Field label={kind === "delivery" ? t("ui.grain.ticket") : t("ui.grain.number")}>
          <Input maxLength={40} value={f.ticket} onChange={set("ticket")} />
        </Field>
        {kind === "delivery" ? <DeliveryFields f={f} set={set} farms={farmList} /> : <SettlementFields f={f} set={set} />}
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}
