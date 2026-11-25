/** Diálogo para crear una orden de trabajo: tarea, lotes, quién la hace, máquina e insumos. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DOSE_UNITS_FOR, localDate, ORDER_LABORS } from "@yvy/shared";
import { post } from "../../../lib/api";
import { t, tk } from "../../../lib/i18n";
import { useFarm, useFarms, useMembers, useSeasons } from "../../../lib/queries";
import { useProducts } from "../../../lib/products";
import type { Product } from "../../../lib/types";
import { Button, Field, Form, FormFooter, Input, Modal, Select, toast } from "../../ui";
import { useContractors } from "../ContractorsPanel";
import { useMachines } from "../MachinesPanel";

interface Dose {
  productId: string;
  dose: string;
  unit: string;
}

type OrderForm = { farmId: string; labor: string; assigneeId: string; dueDate: string; areaHa: string; machineId: string; contractorId: string; seasonId: string; note: string };

const DOSE_UNITS = ["l_ha", "ml_ha", "kg_ha", "g_ha"].map((u) => ({ value: u, label: u.replace("_", "/") }));

function orderBody(f: OrderForm, doses: Dose[], catalog: Product[]) {
  return {
    labor: f.labor,
    ...(f.areaHa ? { areaHa: Number(f.areaHa) } : {}),
    products: doses
      .filter((d) => d.productId && Number(d.dose) > 0)
      .map((d) => ({ productId: d.productId, name: catalog.find((p) => p.id === d.productId)?.name ?? "", dose: Number(d.dose), unit: d.unit })),
    ...(f.machineId ? { machineId: f.machineId } : {}),
    ...(f.contractorId ? { contractorId: f.contractorId } : {}),
    ...(f.seasonId ? { seasonId: f.seasonId } : {}),
    ...(f.note.trim() ? { note: f.note.trim() } : {}),
  };
}

/** Lotes de la estancia como casillas. */
function PlotPicker({ plots, picked, onChange }: { plots: { id: string; name: string }[]; picked: string[]; onChange: (ids: string[]) => void }) {
  return (
    <Field label={t("ui.order.plots")} wide>
      <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-auto rounded-md border border-linea bg-papel p-2">
        {plots.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => onChange(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
            {p.name}
          </label>
        ))}
      </div>
    </Field>
  );
}

/** Insumos de la orden con su dosis y unidad. */
function DoseRows({ doses, products, labor, onChange }: { doses: Dose[]; products: Product[]; labor: string; onChange: (d: Dose[]) => void }) {
  const upd = (i: number, patch: Partial<Dose>) => onChange(doses.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const add = () => {
    const p = products[0];
    if (p) onChange([...doses, { productId: p.id, dose: "", unit: labor === "fertilizing" ? "kg_ha" : DOSE_UNITS_FOR[p.unit][0] }]);
  };
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <span className="text-sm font-medium">{t("ui.order.products")}</span>
      {doses.map((d, i) => (
        <div key={i} className="grid grid-cols-[1fr_6rem_7rem] gap-2">
          <Select value={d.productId} onChange={(e) => upd(i, { productId: e.target.value })} options={products.map((p) => ({ value: p.id, label: p.name }))} />
          <Input type="number" min={0} step="any" aria-label={t("ui.order.doseUnit")} value={d.dose} onChange={(e) => upd(i, { dose: e.target.value })} />
          <Select value={d.unit} onChange={(e) => upd(i, { unit: e.target.value })} options={DOSE_UNITS} />
        </div>
      ))}
      <div>
        <Button onClick={add}>{t("ui.order.productAdd")}</Button>
      </div>
    </div>
  );
}

function useSaveOrder(farmId: string, form: OrderForm, plotIds: string[], doses: Dose[], onClose: () => void) {
  const qc = useQueryClient();
  const members = useMembers();
  const products = useProducts();
  return useMutation({
    mutationFn: async () => {
      if (!plotIds.length) throw new Error(t("ui.order.noPlots"));
      const order = orderBody(form, doses, products.data ?? []);
      return post("/org/erp/work-orders", { farmId, plotIds, assigneeId: form.assigneeId || members.data?.[0]?.userId, dueDate: form.dueDate, order });
    },
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    },
  });
}

/** Alta de una orden de trabajo. */
export function OrderModal({ onClose }: { onClose: () => void }) {
  const farms = useFarms();
  const members = useMembers();
  const machines = useMachines();
  const contractors = useContractors();
  const products = useProducts();
  const [f, setF] = useState<OrderForm>({ farmId: "", labor: "spraying", assigneeId: "", dueDate: localDate(Date.now()), areaHa: "", machineId: "", contractorId: "", seasonId: "", note: "" });
  const [plotIds, setPlotIds] = useState<string[]>([]);
  const [doses, setDoses] = useState<Dose[]>([]);
  const farmId = f.farmId || farms.data?.[0]?.id || "";
  const farm = useFarm(farmId, !!farmId);
  const seasons = useSeasons(farmId, !!farmId);
  const save = useSaveOrder(farmId, f, plotIds, doses, onClose);
  const set = (k: keyof OrderForm) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const none = { value: "", label: t("ui.order.noneOpt") };
  return (
    <Modal title={t("ui.order.new")} onClose={onClose}>
      <Form onSubmit={() => save.mutate()}>
        <Field label={t("ui.order.labor")}>
          <Select value={f.labor} onChange={set("labor")} options={ORDER_LABORS.map((x) => ({ value: x, label: tk(`ui.order.labor_${x}`) }))} />
        </Field>
        <Field label={t("ui.order.due")}>
          <Input type="date" required value={f.dueDate} onChange={set("dueDate")} />
        </Field>
        <Field label={t("ui.cost.farm")}>
          <Select
            value={farmId}
            onChange={(e) => {
              setF({ ...f, farmId: e.target.value });
              setPlotIds([]);
            }}
            options={(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
          />
        </Field>
        <Field label={t("ui.order.assignee")}>
          <Select value={f.assigneeId || (members.data?.[0]?.userId ?? "")} onChange={set("assigneeId")} options={(members.data ?? []).map((m) => ({ value: m.userId, label: m.fullName }))} />
        </Field>
        <PlotPicker plots={farm.data?.plots ?? []} picked={plotIds} onChange={setPlotIds} />
        <Field label={t("ui.order.area")} hint={t("ui.order.areaHint")}>
          <Input type="number" min={0} step="any" value={f.areaHa} onChange={set("areaHa")} />
        </Field>
        <Field label={t("ui.order.machine")}>
          <Select value={f.machineId} onChange={set("machineId")} options={[none, ...(machines.data ?? []).map((m) => ({ value: m.id, label: m.name }))]} />
        </Field>
        <Field label={t("ui.order.contractor")} wide>
          <Select value={f.contractorId} onChange={set("contractorId")} options={[none, ...(contractors.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
        </Field>
        <Field label={t("ui.common.season")} wide>
          <Select value={f.seasonId} onChange={set("seasonId")} options={[none, ...(seasons.data?.seasons ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
        {(f.labor === "spraying" || f.labor === "fertilizing") && <DoseRows doses={doses} products={products.data ?? []} labor={f.labor} onChange={setDoses} />}
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}
