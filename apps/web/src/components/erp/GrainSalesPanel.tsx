/** Venta de granos: contratos, entregas con ticket y liquidaciones (E-34). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CROPS, CURRENCIES, localDate, toMinor, type Currency } from "@yvy/shared";
import { del, get, post } from "../../lib/api";
import { fmtIsoDate, fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs, fmtMoney } from "../../lib/money";
import { useFarms } from "../../lib/queries";
import { Button, type Column, DataTable, EmptyState, ErrorBox, Field, Form, FormFooter, Input, Modal, Select, Spinner, Tabs, toast } from "../ui";
import { useParties } from "./PartiesPanel";
import { RowModal, type FieldDef } from "./MasterPanel";
import { useSeasonList } from "./CostsPanel";
import { HeaderActions, RowMenu, useTableExport } from "./adminSlot";
import type { GrainDeliveryRow as Delivery } from "@yvy/shared";

interface Contract {
  id: string;
  partyId: string | null;
  number: string | null;
  crop: string;
  tons: number;
  priceMinor: number;
  currency: Currency;
  deliveredTons: number;
  toDeliverTons: number;
  settledTons: number;
  toSettleTons: number;
  settledAmount: number;
}
interface Settlement {
  id: string;
  contractId: string;
  date: string;
  tons: number;
  netAmount: number;
  netPyg: number;
  currency: Currency;
  dueDate: string | null;
  paidAmount: number;
  number: string | null;
}

export function GrainSalesPanel() {
  const contracts = useQuery({ queryKey: ["erp", "grain-contracts-summary"], queryFn: () => get<Contract[]>("/org/erp/grain-contracts/summary") });
  const deliveries = useQuery({ queryKey: ["erp", "grain-deliveries"], queryFn: () => get<Delivery[]>("/org/erp/grain-deliveries") });
  const settlements = useQuery({ queryKey: ["erp", "grain-settlements"], queryFn: () => get<Settlement[]>("/org/erp/grain-settlements") });
  const parties = useParties();
  const seasons = useSeasonList();
  const [newContract, setNewContract] = useState(false);
  const [action, setAction] = useState<{ kind: "delivery" | "settlement"; contract: Contract } | null>(null);
  const [tab, setTab] = useState<"contracts" | "deliveries" | "settlements">("contracts");
  const exp = useTableExport(tab === "contracts" ? "contratos-de-granos" : tab === "deliveries" ? "entregas-de-granos" : "liquidaciones");
  const qc = useQueryClient();
  const removeD = useMutation({
    mutationFn: (id: string) => del(`/org/erp/grain-deliveries/${id}`),
    onSuccess: () => {
      toast(t("ui.erpDeleted"));
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  const removeS = useMutation({
    mutationFn: (id: string) => del(`/org/erp/grain-settlements/${id}`),
    onSuccess: () => {
      toast(t("ui.erpDeleted"));
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (contracts.isLoading) return <Spinner />;
  if (contracts.error) return <ErrorBox error={contracts.error} />;
  const party = (id: string | null) => parties.data?.find((p) => p.id === id)?.name ?? "";
  const label = (id: string) => {
    const c = contracts.data?.find((x) => x.id === id);
    return c ? `${c.number ?? tk(`fields.crop_${c.crop}`)}` : "?";
  };
  const fields: FieldDef[] = [
    { key: "partyId", label: t("ui.grainBuyer"), type: "select", options: [{ value: "", label: "—" }, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))] },
    { key: "number", label: t("ui.grainNumber"), maxLength: 40 },
    { key: "crop", label: t("ui.grainCrop"), type: "select", initial: "soja", options: CROPS.map((c) => ({ value: c, label: tk(`fields.crop_${c}`) })) },
    { key: "seasonId", label: t("ui.costSeason"), type: "select", options: [{ value: "", label: "—" }, ...(seasons.data ?? []).map((x) => ({ value: x.id, label: x.name }))] },
    { key: "tons", label: t("ui.grainTons"), type: "number", required: true, min: 0 },
    { key: "currency", label: t("ui.currency"), type: "select", initial: "PYG", options: CURRENCIES.map((c) => ({ value: c, label: c })) },
    { key: "priceMinor", label: t("ui.grainPrice"), type: "money", required: true, currencyKey: "currency" },
    { key: "deliveryFrom", label: t("ui.grainFrom"), type: "date" },
    { key: "deliveryTo", label: t("ui.grainTo"), type: "date" },
  ];
  const contractRows = contracts.data ?? [];
  const deliveryRows = deliveries.data ?? [];
  const settlementRows = settlements.data ?? [];
  const newButton = (
    <Button variant="primary" onClick={() => setNewContract(true)}>
      {t("ui.grainNew")}
    </Button>
  );
  const contractCols: Column<Contract>[] = [
    {
      id: "contract",
      header: t("ui.grainContract"),
      cell: (c) => (
        <>
          <div className="font-medium">
            {tk(`fields.crop_${c.crop}`)} {c.number ? `· ${c.number}` : ""}
          </div>
          <div className="text-meta font-normal text-tinta-2">{party(c.partyId)}</div>
        </>
      ),
    },
    { id: "tons", header: t("ui.grainTons"), align: "right", cell: (c) => fmtNum(c.tons) },
    { id: "delivered", header: t("ui.grainDelivered"), align: "right", hideBelow: "sm", cell: (c) => t("ui.grainOf", { a: fmtNum(c.deliveredTons), b: fmtNum(c.toDeliverTons) }) },
    { id: "settled", header: t("ui.grainSettled"), align: "right", hideBelow: "md", cell: (c) => t("ui.grainOf", { a: fmtNum(c.settledTons), b: fmtNum(c.toSettleTons) }) },
    { id: "price", header: t("ui.grainPrice"), align: "right", hideBelow: "sm", cell: (c) => fmtMoney(c.priceMinor, c.currency) },
    {
      id: "actions",
      header: <span className="sr-only">{t("ui.rowActionsHeader")}</span>,
      align: "right",
      cell: (c) => (
        <span className="inline-flex gap-1 whitespace-nowrap">
          <Button size="sm" variant="quiet" onClick={() => setAction({ kind: "delivery", contract: c })}>
            {t("ui.grainAddDelivery")}
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setAction({ kind: "settlement", contract: c })}>
            {t("ui.grainAddSettlement")}
          </Button>
        </span>
      ),
    },
  ];
  const deliveryCols: Column<Delivery>[] = [
    { id: "date", header: t("ui.costDate"), cell: (d) => <span className="num">{fmtIsoDate(d.date)}</span>, sort: (a, b) => a.date.localeCompare(b.date) },
    { id: "contract", header: t("ui.grainContract"), cell: (d) => <span className="font-medium">{label(d.contractId)}</span> },
    { id: "tons", header: t("ui.grainTons"), align: "right", cell: (d) => `${fmtNum(d.tons)} t` },
    ...(deliveryRows.some((d) => d.ticket) ? [{ id: "ticket", header: t("ui.grainTicket"), hideBelow: "sm", cell: (d: Delivery) => <span className="text-tinta-2">{d.ticket ?? ""}</span> } satisfies Column<Delivery>] : []),
    ...(deliveryRows.some((d) => d.moisturePct !== null) ? [{ id: "moisture", header: t("ui.grainMoisture"), align: "right", hideBelow: "md", cell: (d: Delivery) => (d.moisturePct === null ? "" : `${d.moisturePct} %`) } satisfies Column<Delivery>] : []),
    { id: "menu", header: <span className="sr-only">{t("ui.rowActionsHeader")}</span>, align: "right", width: "3rem", cell: (d) => <RowMenu name={fmtIsoDate(d.date)} onDelete={() => removeD.mutate(d.id)} /> },
  ];
  const settlementCols: Column<Settlement>[] = [
    { id: "date", header: t("ui.costDate"), cell: (l) => <span className="num">{fmtIsoDate(l.date)}</span>, sort: (a, b) => a.date.localeCompare(b.date) },
    { id: "contract", header: t("ui.grainContract"), cell: (l) => <span className="font-medium">{label(l.contractId)}</span> },
    { id: "tons", header: t("ui.grainTons"), align: "right", hideBelow: "sm", cell: (l) => `${fmtNum(l.tons)} t` },
    { id: "net", header: t("ui.grainNet"), align: "right", cell: (l) => fmtMoney(l.netAmount, l.currency) },
    { id: "netPyg", header: t("ui.grainNetPyg"), align: "right", hideBelow: "md", cell: (l) => <span className="text-tinta-2">{fmtGs(l.netPyg)}</span> },
    { id: "due", header: t("ui.purchDueLabel"), hideBelow: "md", cell: (l) => <span className="text-tinta-2">{l.dueDate ? fmtIsoDate(l.dueDate) : ""}</span> },
    { id: "menu", header: <span className="sr-only">{t("ui.rowActionsHeader")}</span>, align: "right", width: "3rem", cell: (l) => <RowMenu name={fmtIsoDate(l.date)} onDelete={() => removeS.mutate(l.id)} /> },
  ];
  const noContracts = contractRows.length === 0;
  const current = tab === "contracts" ? contractRows.length : tab === "deliveries" ? deliveryRows.length : settlementRows.length;
  return (
    <div className="flex flex-col gap-4">
      {!noContracts && <HeaderActions>{newButton}</HeaderActions>}
      {noContracts ? (
        <EmptyState title={t("ui.emptyGrainTitle")} action={newButton}>
          {t("ui.emptyGrainBody")}
        </EmptyState>
      ) : (
        <>
          {current > 0 && exp.menu}
          <Tabs
            tabs={[
              { id: "contracts", label: t("ui.grainTabContracts"), count: contractRows.length },
              { id: "deliveries", label: t("ui.grainDeliveries"), count: deliveryRows.length },
              { id: "settlements", label: t("ui.grainSettlements"), count: settlementRows.length },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div ref={exp.ref}>
            {tab === "contracts" && <DataTable columns={contractCols} rows={contractRows} rowKey={(c) => c.id} caption={t("ui.grainTabContracts")} />}
            {tab === "deliveries" && (
              <DataTable columns={deliveryCols} rows={deliveryRows} rowKey={(d) => d.id} caption={t("ui.grainDeliveries")} empty={<EmptyState compact title={t("ui.erpEmpty")}>{t("ui.emptyDeliveriesBody")}</EmptyState>} />
            )}
            {tab === "settlements" && (
              <DataTable columns={settlementCols} rows={settlementRows} rowKey={(l) => l.id} caption={t("ui.grainSettlements")} empty={<EmptyState compact title={t("ui.erpEmpty")}>{t("ui.emptySettlementsBody")}</EmptyState>} />
            )}
          </div>
        </>
      )}
      {(removeD.error || removeS.error) && <ErrorBox error={removeD.error ?? removeS.error} />}
      {newContract && <RowModal title={t("ui.grainNew")} fields={fields} row={null} path="grain-contracts" onClose={() => setNewContract(false)} />}
      {action && <ActionModal {...action} onClose={() => setAction(null)} />}
    </div>
  );
}

function ActionModal({ kind, contract, onClose }: { kind: "delivery" | "settlement"; contract: Contract; onClose: () => void }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(localDate(Date.now()));
  const [tons, setTons] = useState(String(kind === "delivery" ? "" : contract.toSettleTons || ""));
  const [ticket, setTicket] = useState("");
  const [moisture, setMoisture] = useState("");
  const [deductions, setDeductions] = useState("");
  const [due, setDue] = useState("");
  // La entrega se registra en la estancia (A-23): con varias hay que elegir cuál
  const farms = useFarms();
  const [farmId, setFarmId] = useState("");
  const save = useMutation({
    mutationFn: () =>
      kind === "delivery"
        ? post("/org/erp/grain-deliveries", {
            contractId: contract.id,
            date,
            tons: Number(tons),
            farmId: farmId || (farms.data?.length === 1 ? farms.data[0]!.id : null),
            ticket: ticket || null,
            moisturePct: moisture === "" ? null : Number(moisture),
          })
        : post("/org/erp/grain-settlements", {
            contractId: contract.id,
            date,
            tons: Number(tons),
            number: ticket || null,
            deductionsMinor: deductions === "" ? null : toMinor(Number(deductions), contract.currency),
            dueDate: due || null,
          }),
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  return (
    <Modal title={kind === "delivery" ? t("ui.grainAddDelivery") : t("ui.grainAddSettlement")} onClose={onClose}>
      <Form className="grid grid-cols-2 gap-3" onSubmit={() => save.mutate()}>
        <Field label={t("ui.costDate")}>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("ui.grainTons")}>
          <Input required type="number" min={0} step="any" value={tons} onChange={(e) => setTons(e.target.value)} />
        </Field>
        <Field label={kind === "delivery" ? t("ui.grainTicket") : t("ui.grainNumber")}>
          <Input maxLength={40} value={ticket} onChange={(e) => setTicket(e.target.value)} />
        </Field>
        {kind === "delivery" ? (
          <>
            <Field label={t("ui.grainMoisture")}>
              <Input type="number" min={0} max={100} step="any" value={moisture} onChange={(e) => setMoisture(e.target.value)} />
            </Field>
            {(farms.data?.length ?? 0) > 1 && (
              <Field label={t("ui.farm")}>
                <Select
                  required
                  value={farmId}
                  onChange={(e) => setFarmId(e.target.value)}
                  options={[{ value: "", label: "—" }, ...(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))]}
                />
              </Field>
            )}
          </>
        ) : (
          <>
            <Field label={t("ui.grainDeductions")}>
              <Input type="number" min={0} step="any" value={deductions} onChange={(e) => setDeductions(e.target.value)} />
            </Field>
            <Field label={t("ui.purchDueLabel")}>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
          </>
        )}
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}
