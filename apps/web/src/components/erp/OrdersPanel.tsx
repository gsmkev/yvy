/** Órdenes de trabajo (E-20, E-21): una tarea por lote con insumos, máquina y operario o contratista. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DOSE_UNITS_FOR, localDate, ORDER_LABORS, type WorkOrder } from "@yvy/shared";
import { get, post } from "../../lib/api";
import { fmtIsoDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { useFarm, useFarms, useMembers } from "../../lib/queries";
import { useProducts } from "../ProductsPanel";
import { Button, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "../ui";
import { useContractors } from "./ContractorsPanel";
import { useMachines } from "./MachinesPanel";

interface OrderRow {
  id: string;
  title: string;
  plotName: string | null;
  assigneeName: string | null;
  dueDate: string;
  status: "open" | "done" | "cancelled";
  order: WorkOrder;
  plannedAreaHa: number | null;
  actualAreaHa: number | null;
  costPyg?: number;
}

export function OrdersPanel() {
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ["erp", "orders"], queryFn: () => get<OrderRow[]>("/org/erp/work-orders") });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-tinta-2">{t("ui.ordersIntro")}</p>
      <div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          {t("ui.orderNew")}
        </Button>
      </div>
      {q.isLoading && <Spinner />}
      {q.error ? <ErrorBox error={q.error} /> : null}
      {q.data && q.data.length === 0 && <Empty>{t("ui.erpEmpty")}</Empty>}
      {q.data && q.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-tinta-2">
                <th className="py-2 pr-4 font-medium">{t("ui.orderLabor")}</th>
                <th className="py-2 pr-4 font-medium">{t("ui.orderPlot")}</th>
                <th className="py-2 pr-4 font-medium">{t("ui.orderAssignee")}</th>
                <th className="py-2 pr-4 font-medium">{t("ui.orderDue")}</th>
                <th className="py-2 pr-4 font-medium">{t("ui.orderStatus")}</th>
                <th className="py-2 pr-4 text-right font-medium">{t("ui.orderPlanned")}</th>
                <th className="py-2 pr-4 text-right font-medium">{t("ui.orderActual")}</th>
                {q.data[0]?.costPyg !== undefined && <th className="py-2 text-right font-medium">{t("ui.orderCost")}</th>}
              </tr>
            </thead>
            <tbody>
              {q.data.map((o) => (
                <tr key={o.id} className="border-b border-linea">
                  <td className="py-2.5 pr-4 font-medium">{tk(`ui.orderLabor_${o.order.labor}`)}</td>
                  <td className="py-2.5 pr-4">{o.plotName}</td>
                  <td className="py-2.5 pr-4">{o.assigneeName}</td>
                  <td className="num py-2.5 pr-4">{fmtIsoDate(o.dueDate)}</td>
                  <td className="py-2.5 pr-4">{tk(`ui.orderStatus_${o.status}`)}</td>
                  <td className="num py-2.5 pr-4 text-right">{o.plannedAreaHa !== null ? `${o.plannedAreaHa.toLocaleString("es-PY", { maximumFractionDigits: 1 })} ha` : ""}</td>
                  <td className="num py-2.5 pr-4 text-right">{o.actualAreaHa !== null ? `${o.actualAreaHa.toLocaleString("es-PY", { maximumFractionDigits: 1 })} ha` : ""}</td>
                  {o.costPyg !== undefined && <td className="num py-2.5 text-right">{o.status === "done" ? fmtGs(o.costPyg) : ""}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <OrderModal onClose={() => setCreating(false)} />}
    </div>
  );
}

interface Dose {
  productId: string;
  dose: string;
  unit: string;
}

function OrderModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const farms = useFarms();
  const members = useMembers();
  const machines = useMachines();
  const contractors = useContractors();
  const products = useProducts();
  const [f, setF] = useState({ farmId: "", labor: "spraying", assigneeId: "", dueDate: localDate(Date.now()), areaHa: "", machineId: "", contractorId: "", note: "" });
  const [plotIds, setPlotIds] = useState<string[]>([]);
  const [doses, setDoses] = useState<Dose[]>([]);
  const farmId = f.farmId || farms.data?.[0]?.id || "";
  const farm = useFarm(farmId, !!farmId);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation({
    mutationFn: async () => {
      if (!plotIds.length) throw new Error(t("ui.orderNoPlots"));
      const catalog = products.data ?? [];
      const order = {
        labor: f.labor,
        ...(f.areaHa ? { areaHa: Number(f.areaHa) } : {}),
        products: doses
          .filter((d) => d.productId && Number(d.dose) > 0)
          .map((d) => ({ productId: d.productId, name: catalog.find((p) => p.id === d.productId)?.name ?? "", dose: Number(d.dose), unit: d.unit })),
        ...(f.machineId ? { machineId: f.machineId } : {}),
        ...(f.contractorId ? { contractorId: f.contractorId } : {}),
        ...(f.note.trim() ? { note: f.note.trim() } : {}),
      };
      return post("/org/erp/work-orders", { farmId, plotIds, assigneeId: f.assigneeId || members.data?.[0]?.userId, dueDate: f.dueDate, order });
    },
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    },
  });
  const none = { value: "", label: t("ui.orderNoneOpt") };
  const inputs = f.labor === "spraying" || f.labor === "fertilizing";
  const addDose = () => {
    const p = products.data?.[0];
    if (p) setDoses([...doses, { productId: p.id, dose: "", unit: f.labor === "fertilizing" ? "kg_ha" : DOSE_UNITS_FOR[p.unit][0] }]);
  };
  const upd = (i: number, patch: Partial<Dose>) => setDoses(doses.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  return (
    <Modal title={t("ui.orderNew")} onClose={onClose}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.orderLabor")}>
          <Select value={f.labor} onChange={set("labor")} options={ORDER_LABORS.map((x) => ({ value: x, label: tk(`ui.orderLabor_${x}`) }))} />
        </Field>
        <Field label={t("ui.orderDue")}>
          <Input type="date" required value={f.dueDate} onChange={set("dueDate")} />
        </Field>
        <Field label={t("ui.costFarm")}>
          <Select
            value={farmId}
            onChange={(e) => {
              setF({ ...f, farmId: e.target.value });
              setPlotIds([]);
            }}
            options={(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
          />
        </Field>
        <Field label={t("ui.orderAssignee")}>
          <Select value={f.assigneeId || (members.data?.[0]?.userId ?? "")} onChange={set("assigneeId")} options={(members.data ?? []).map((m) => ({ value: m.userId, label: m.fullName }))} />
        </Field>
        <div className="col-span-2">
          <Field label={t("ui.orderPlots")}>
            <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-auto rounded-md border border-linea bg-papel p-2">
              {(farm.data?.plots ?? []).map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={plotIds.includes(p.id)} onChange={(e) => setPlotIds(e.target.checked ? [...plotIds, p.id] : plotIds.filter((x) => x !== p.id))} />
                  {p.name}
                </label>
              ))}
            </div>
          </Field>
        </div>
        <Field label={t("ui.orderArea")} hint={t("ui.orderAreaHint")}>
          <Input type="number" min={0} step="any" value={f.areaHa} onChange={set("areaHa")} />
        </Field>
        <Field label={t("ui.orderMachine")}>
          <Select value={f.machineId} onChange={set("machineId")} options={[none, ...(machines.data ?? []).map((m) => ({ value: m.id, label: m.name }))]} />
        </Field>
        <div className="col-span-2">
          <Field label={t("ui.orderContractor")}>
            <Select value={f.contractorId} onChange={set("contractorId")} options={[none, ...(contractors.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
          </Field>
        </div>
        {inputs && (
          <div className="col-span-2 flex flex-col gap-2">
            <span className="text-sm font-medium">{t("ui.orderProducts")}</span>
            {doses.map((d, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_7rem] gap-2">
                <Select
                  value={d.productId}
                  onChange={(e) => upd(i, { productId: e.target.value })}
                  options={(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
                />
                <Input type="number" min={0} step="any" aria-label={t("ui.orderDoseUnit")} value={d.dose} onChange={(e) => upd(i, { dose: e.target.value })} />
                <Select
                  value={d.unit}
                  onChange={(e) => upd(i, { unit: e.target.value })}
                  options={["l_ha", "ml_ha", "kg_ha", "g_ha"].map((u) => ({ value: u, label: u.replace("_", "/") }))}
                />
              </div>
            ))}
            <div>
              <Button onClick={addDose}>{t("ui.orderProductAdd")}</Button>
            </div>
          </div>
        )}
        {save.error ? (
          <div className="col-span-2">
            <ErrorBox error={save.error} />
          </div>
        ) : null}
        <div className="col-span-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {t("ui.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
