/** Órdenes de trabajo: una tarea por lote con insumos, máquina y operario o contratista. */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DOSE_UNITS_FOR, localDate, ORDER_LABORS, groupOrders, plotsLabel, productsLabel, type OrderGroup, type OrderRow } from "@yvy/shared";
import { get, post } from "../../lib/api";
import { fmtIsoDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { useFarm, useFarms, useMembers, useSeasons } from "../../lib/queries";
import { orderSheetHtml } from "../../lib/workOrders";
import { useProducts } from "../../lib/products";
import { Button, type Column, DataTable, EmptyState, ErrorBox, Field, Form, FormFooter, Input, Modal, Select, Spinner, toast } from "../ui";
import { useContractors } from "./ContractorsPanel";
import { useMachines } from "./MachinesPanel";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions } from "./adminSlot";

/** Órdenes de trabajo agrupadas por tarea, con su hoja imprimible. */
export function OrdersPanel() {
  const [creating, setCreating] = useState(false);
  const farms = useFarms();
  const q = useQuery({ queryKey: ["erp", "orders"], queryFn: () => get<OrderRow[]>("/org/erp/work-orders") });
  const groups = useMemo(() => groupOrders(q.data ?? []), [q.data]);
  const farmName = (id: string) => farms.data?.find((f) => f.id === id)?.name ?? "";
  const hasCost = groups.some((g) => g.costPyg !== undefined);
  const ha = (n: number | null) => (n !== null ? n.toLocaleString("es-PY", { maximumFractionDigits: 1 }) + " ha" : "");
  const newBtn = (
    <Button variant="primary" onClick={() => setCreating(true)}>
      {t("ui.order.new")}
    </Button>
  );
  const columns: Column<OrderGroup>[] = [
    {
      id: "labor",
      header: t("ui.order.labor"),
      cell: (g) => (
        <>
          {tk(`ui.order.labor_${g.labor}`)}
          <span className="block text-meta font-normal text-tinta-2 lg:hidden">{plotsLabel(g.plotNames)}</span>
        </>
      ),
    },
    { id: "plots", header: t("ui.order.plots"), hideBelow: "lg", cell: (g) => plotsLabel(g.plotNames) },
    {
      id: "executor",
      header: t("ui.order.executor"),
      hideBelow: "md",
      cell: (g) =>
        g.contractorName ? (
          <>
            {g.contractorName}
            <span className="block text-meta text-tinta-2">{g.assigneeName}</span>
          </>
        ) : (
          g.assigneeName
        ),
    },
    { id: "machine", header: t("ui.order.machine"), hideBelow: "lg", cell: (g) => g.machine ?? "" },
    { id: "products", header: t("ui.order.products"), hideBelow: "lg", cell: (g) => productsLabel(g.order) },
    { id: "due", header: t("ui.order.due"), cell: (g) => <span className="whitespace-nowrap">{fmtIsoDate(g.dueDate)}</span> },
    {
      id: "status",
      header: t("ui.order.status"),
      hideBelow: "sm",
      cell: (g) => (g.status === "open" && g.done > 0 ? t("ui.order.progress", { done: g.done, total: g.rows.length }) : tk(`ui.order.status_${g.status}`)),
    },
    { id: "planned", header: t("ui.order.planned"), align: "right", hideBelow: "md", cell: (g) => ha(g.plannedHa) },
    { id: "actual", header: t("ui.order.actual"), align: "right", hideBelow: "lg", cell: (g) => ha(g.actualHa) },
    ...(hasCost
      ? [{ id: "cost", header: t("ui.order.cost"), align: "right" as const, hideBelow: "lg" as const, cell: (g: OrderGroup) => (g.done > 0 && g.costPyg !== undefined ? fmtGs(g.costPyg) : "") }]
      : []),
    {
      id: "_print",
      header: <span className="sr-only">{t("ui.order.print")}</span>,
      align: "right",
      cell: (g) => (
        <Button variant="quiet" size="sm" onClick={() => printOrder(g, farmName(g.farmId))}>
          {t("ui.order.print")}
        </Button>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      {groups.length > 0 && <HeaderActions>{newBtn}</HeaderActions>}
      {q.isLoading && <Spinner />}
      {q.error ? <ErrorBox error={q.error} /> : null}
      {q.data && q.data.length === 0 && (
        <EmptyState title={t("ui.order.emptyTitle")} action={newBtn}>
          {t("ui.order.emptyHint")}
        </EmptyState>
      )}
      {groups.length > 0 && (
        <ExportableTable name="ordenes-de-trabajo">
          <DataTable columns={columns} rows={groups} rowKey={(g) => g.key} caption={t("ui.admin.section_orders")} />
        </ExportableTable>
      )}
      {creating && <OrderModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function printOrder(g: OrderGroup, farmName: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(orderSheetHtml(g, farmName));
  w.document.close();
  w.focus();
  w.print();
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
  const [f, setF] = useState({ farmId: "", labor: "spraying", assigneeId: "", dueDate: localDate(Date.now()), areaHa: "", machineId: "", contractorId: "", seasonId: "", note: "" });
  const [plotIds, setPlotIds] = useState<string[]>([]);
  const [doses, setDoses] = useState<Dose[]>([]);
  const farmId = f.farmId || farms.data?.[0]?.id || "";
  const farm = useFarm(farmId, !!farmId);
  const seasons = useSeasons(farmId, !!farmId);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation({
    mutationFn: async () => {
      if (!plotIds.length) throw new Error(t("ui.order.noPlots"));
      const catalog = products.data ?? [];
      const order = {
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
      return post("/org/erp/work-orders", { farmId, plotIds, assigneeId: f.assigneeId || members.data?.[0]?.userId, dueDate: f.dueDate, order });
    },
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    },
  });
  const none = { value: "", label: t("ui.order.noneOpt") };
  const inputs = f.labor === "spraying" || f.labor === "fertilizing";
  const addDose = () => {
    const p = products.data?.[0];
    if (p) setDoses([...doses, { productId: p.id, dose: "", unit: f.labor === "fertilizing" ? "kg_ha" : DOSE_UNITS_FOR[p.unit][0] }]);
  };
  const upd = (i: number, patch: Partial<Dose>) => setDoses(doses.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  return (
    <Modal title={t("ui.order.new")} onClose={onClose}>
      <Form className="grid grid-cols-2 gap-3" onSubmit={() => save.mutate()}>
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
        <div className="col-span-2">
          <Field label={t("ui.order.plots")}>
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
        <Field label={t("ui.order.area")} hint={t("ui.order.areaHint")}>
          <Input type="number" min={0} step="any" value={f.areaHa} onChange={set("areaHa")} />
        </Field>
        <Field label={t("ui.order.machine")}>
          <Select value={f.machineId} onChange={set("machineId")} options={[none, ...(machines.data ?? []).map((m) => ({ value: m.id, label: m.name }))]} />
        </Field>
        <div className="col-span-2">
          <Field label={t("ui.order.contractor")}>
            <Select value={f.contractorId} onChange={set("contractorId")} options={[none, ...(contractors.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label={t("ui.common.season")}>
            <Select
              value={f.seasonId}
              onChange={set("seasonId")}
              options={[none, ...(seasons.data?.seasons ?? []).map((x) => ({ value: x.id, label: x.name }))]}
            />
          </Field>
        </div>
        {inputs && (
          <div className="col-span-2 flex flex-col gap-2">
            <span className="text-sm font-medium">{t("ui.order.products")}</span>
            {doses.map((d, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_7rem] gap-2">
                <Select
                  value={d.productId}
                  onChange={(e) => upd(i, { productId: e.target.value })}
                  options={(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
                />
                <Input type="number" min={0} step="any" aria-label={t("ui.order.doseUnit")} value={d.dose} onChange={(e) => upd(i, { dose: e.target.value })} />
                <Select
                  value={d.unit}
                  onChange={(e) => upd(i, { unit: e.target.value })}
                  options={["l_ha", "ml_ha", "kg_ha", "g_ha"].map((u) => ({ value: u, label: u.replace("_", "/") }))}
                />
              </div>
            ))}
            <div>
              <Button onClick={addDose}>{t("ui.order.productAdd")}</Button>
            </div>
          </div>
        )}
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}
