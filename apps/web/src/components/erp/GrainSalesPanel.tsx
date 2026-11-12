/** Venta de granos: contratos, entregas con ticket y liquidaciones (E-34). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CROPS, CURRENCIES, localDate, toMinor, type Currency } from "@yvy/shared";
import { del, get, post } from "../../lib/api";
import { fmtIsoDate, fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs, fmtMoney } from "../../lib/money";
import { useFarms } from "../../lib/queries";
import { Button, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "../ui";
import { useParties } from "./PartiesPanel";
import { RowModal, type FieldDef } from "./MasterPanel";
import { useSeasonList } from "./CostsPanel";
import { ExportableTable } from "../ExportableTable";

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
interface Delivery {
  id: string;
  contractId: string;
  date: string;
  tons: number;
  ticket: string | null;
  moisturePct: number | null;
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
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-tinta-2">{t("ui.grainIntro")}</p>
      <div>
        <Button variant="primary" onClick={() => setNewContract(true)}>
          {t("ui.grainNew")}
        </Button>
      </div>
      {(contracts.data ?? []).length === 0 ? (
        <Empty>{t("ui.erpEmpty")}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <ExportableTable name="contratos-de-granos">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-linea text-left text-tinta-2">
                  <th className="py-2 pr-4 font-medium">{t("ui.grainContract")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.grainTons")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.grainDelivered")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.grainSettled")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.grainPrice")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(contracts.data ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-linea">
                    <td className="py-2.5 pr-4">
                      <div className="font-medium">
                        {tk(`fields.crop_${c.crop}`)} {c.number ? `· ${c.number}` : ""}
                      </div>
                      <div className="text-tinta-2">{party(c.partyId)}</div>
                    </td>
                    <td className="num py-2.5 pr-4 text-right">{fmtNum(c.tons)}</td>
                    <td className="num py-2.5 pr-4 text-right">{t("ui.grainOf", { a: fmtNum(c.deliveredTons), b: fmtNum(c.toDeliverTons) })}</td>
                    <td className="num py-2.5 pr-4 text-right">{t("ui.grainOf", { a: fmtNum(c.settledTons), b: fmtNum(c.toSettleTons) })}</td>
                    <td className="num py-2.5 pr-4 text-right">{fmtMoney(c.priceMinor, c.currency)}</td>
                    <td className="py-2.5 text-right whitespace-nowrap text-tinta-2">
                      <button className="mr-4 cursor-pointer underline-offset-4 hover:text-surco hover:underline" onClick={() => setAction({ kind: "delivery", contract: c })}>
                        {t("ui.grainAddDelivery")}
                      </button>
                      <button className="cursor-pointer underline-offset-4 hover:text-surco hover:underline" onClick={() => setAction({ kind: "settlement", contract: c })}>
                        {t("ui.grainAddSettlement")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ExportableTable>
        </div>
      )}
      <h2 className="border-b border-linea pb-2 font-serif text-lg font-semibold">{t("ui.grainDeliveries")}</h2>
      {(deliveries.data ?? []).length === 0 ? (
        <Empty>{t("ui.erpEmpty")}</Empty>
      ) : (
        <ExportableTable name="entregas-de-granos">
          <table className="w-full text-sm">
            <tbody>
              {(deliveries.data ?? []).map((d) => (
                <tr key={d.id} className="border-b border-linea">
                  <td className="num py-2.5 pr-4">{fmtIsoDate(d.date)}</td>
                  <td className="py-2.5 pr-4 font-medium">{label(d.contractId)}</td>
                  <td className="py-2.5 pr-4 text-tinta-2">{d.ticket ?? ""}</td>
                  <td className="num py-2.5 pr-4 text-right">{fmtNum(d.tons)} t</td>
                  <td className="num py-2.5 pr-4 text-right text-tinta-2">{d.moisturePct === null ? "" : `${d.moisturePct} %`}</td>
                  <td className="py-2.5 text-right">
                    <button className="cursor-pointer text-tinta-2 underline-offset-4 hover:text-peligro hover:underline" onClick={() => removeD.mutate(d.id)}>
                      {t("ui.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ExportableTable>
      )}
      <h2 className="border-b border-linea pb-2 font-serif text-lg font-semibold">{t("ui.grainSettlements")}</h2>
      {(settlements.data ?? []).length === 0 ? (
        <Empty>{t("ui.erpEmpty")}</Empty>
      ) : (
        <ExportableTable name="liquidaciones">
          <table className="w-full text-sm">
            <tbody>
              {(settlements.data ?? []).map((l) => (
                <tr key={l.id} className="border-b border-linea">
                  <td className="num py-2.5 pr-4">{fmtIsoDate(l.date)}</td>
                  <td className="py-2.5 pr-4 font-medium">{label(l.contractId)}</td>
                  <td className="num py-2.5 pr-4 text-right">{fmtNum(l.tons)} t</td>
                  <td className="num py-2.5 pr-4 text-right">{fmtMoney(l.netAmount, l.currency)}</td>
                  <td className="num py-2.5 pr-4 text-right text-tinta-2">{fmtGs(l.netPyg)}</td>
                  <td className="py-2.5 pr-4 text-tinta-2">{l.dueDate ? t("ui.purchDue", { date: fmtIsoDate(l.dueDate) }) : ""}</td>
                  <td className="py-2.5 text-right">
                    <button className="cursor-pointer text-tinta-2 underline-offset-4 hover:text-peligro hover:underline" onClick={() => removeS.mutate(l.id)}>
                      {t("ui.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ExportableTable>
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
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
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
