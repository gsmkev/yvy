/** Mantenimiento preventivo por horas o kilómetros, con historial de servicios y reparaciones (E-22). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CURRENCIES, MAINTENANCE_KINDS, localDate, toMinor, type Currency } from "@yvy/shared";
import { del, get, post } from "../../lib/api";
import { fmtIsoDate, fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { Button, ConfirmModal, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "../ui";
import { useMachines } from "./MachinesPanel";
import { MasterPanel, useErpList, type FieldDef } from "./MasterPanel";
import { useParties } from "./PartiesPanel";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions, RowMenu } from "./adminSlot";

interface Due {
  planId: string;
  machineId: string;
  machine: string;
  name: string;
  meterKind: "hours" | "km";
  meter: number;
  dueAt: number;
  remaining: number;
  status: "ok" | "soon" | "overdue";
}
interface Plan {
  id: string;
  machineId: string;
  name: string;
  everyUnits: number;
  lastDoneMeter: number;
}
interface Log {
  id: string;
  machineId: string;
  planId: string | null;
  kind: (typeof MAINTENANCE_KINDS)[number];
  occurredAt: number;
  meterValue: number | null;
  description: string | null;
  amountPyg?: number | null;
}

const unitOf = (k: "hours" | "km") => (k === "hours" ? "h" : "km");

export function MaintenancePanel() {
  const machines = useMachines();
  const plans = useErpList<Plan>("maintenance-plans");
  const due = useQuery({ queryKey: ["erp", "maintenance-due"], queryFn: () => get<Due[]>("/org/erp/maintenance/due") });
  const logs = useQuery({ queryKey: ["erp", "maintenance-logs"], queryFn: () => get<Log[]>("/org/erp/maintenance/logs") });
  const [logging, setLogging] = useState<string | null | "new">(null);
  const [removing, setRemoving] = useState<Log | null>(null);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (l: Log) => del(`/org/erp/maintenance/logs/${l.id}`),
    onSuccess: () => {
      toast(t("ui.erpDeleted"));
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (machines.isLoading || logs.isLoading || plans.isLoading) return <Spinner />;
  if (logs.error) return <ErrorBox error={logs.error} />;
  const machine = (id: string) => machines.data?.find((m) => m.id === id);
  const fields: FieldDef[] = [
    {
      key: "machineId",
      label: t("ui.maintMachine"),
      type: "select",
      required: true,
      initial: machines.data?.[0]?.id ?? "",
      options: (machines.data ?? []).map((m) => ({ value: m.id, label: m.name })),
    },
    { key: "name", label: t("ui.maintPlanName"), required: true, maxLength: 80 },
    { key: "everyUnits", label: t("ui.maintEvery"), type: "number", required: true, min: 1, hint: t("ui.maintEveryHint") },
    { key: "lastDoneMeter", label: t("ui.maintLastDone"), type: "number", min: 0, hint: t("ui.maintLastDoneHint") },
  ];
  return (
    <div className="flex flex-col gap-6">
      <HeaderActions>
        <Button variant="primary" onClick={() => setLogging("new")}>
          {t("ui.maintLogNew")}
        </Button>
      </HeaderActions>
      {due.data && due.data.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="border-b border-linea pb-2 text-[18px] leading-6 font-semibold">{t("ui.maintDueTitle")}</h2>
          <ExportableTable name="mantenimiento-vencido">
            <table className="w-full text-sm">
              <tbody>
                {due.data.map((d) => (
                  <tr key={d.planId} className="border-b border-linea">
                    <td className="py-2.5 pr-4 font-medium">{d.machine}</td>
                    <td className="py-2.5 pr-4">{d.name}</td>
                    <td className="num py-2.5 pr-4 text-right text-tinta-2">
                      {fmtNum(d.meter)} / {fmtNum(d.dueAt)} {unitOf(d.meterKind)}
                    </td>
                    <td className={`py-2.5 pr-4 text-right ${d.status === "overdue" ? "text-peligro" : "text-trigo-texto"}`}>
                      {d.status === "overdue"
                        ? t("ui.maintOverdue", { n: `${fmtNum(-d.remaining)} ${unitOf(d.meterKind)}` })
                        : t("ui.maintSoon", { n: `${fmtNum(d.remaining)} ${unitOf(d.meterKind)}` })}
                    </td>
                    <td className="py-2.5 text-right">
                      <button className="cursor-pointer text-tinta-2 underline-offset-4 hover:text-surco hover:underline" onClick={() => setLogging(d.planId)}>
                        {t("ui.maintDone")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ExportableTable>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <h2 className="border-b border-linea pb-2 text-[18px] leading-6 font-semibold">{t("ui.maintPlansTitle")}</h2>
        <MasterPanel<Plan>
          inline
          path="maintenance-plans"
          newLabel={t("ui.maintPlanNew")}
          name={(p) => p.name}
          fields={fields}
          columns={[
            { header: t("ui.maintMachine"), cell: (p) => <span className="font-medium">{machine(p.machineId)?.name}</span> },
            { header: t("ui.maintPlanName"), cell: (p) => p.name },
            {
              header: t("ui.maintEvery"),
              right: true,
              cell: (p) => `${fmtNum(p.everyUnits)} ${unitOf(machine(p.machineId)?.meterKind ?? "hours")}`,
            },
            {
              header: t("ui.maintLastDone"),
              right: true,
              cell: (p) => `${fmtNum(p.lastDoneMeter)} ${unitOf(machine(p.machineId)?.meterKind ?? "hours")}`,
            },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="border-b border-linea pb-2 text-[18px] leading-6 font-semibold">{t("ui.maintHistoryTitle")}</h2>
        {(logs.data ?? []).length === 0 ? (
          <Empty>{t("ui.erpEmpty")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <ExportableTable name="mantenimiento-historial">
              <table className="w-full text-sm">
                <tbody>
                  {(logs.data ?? []).map((l) => (
                    <tr key={l.id} className="border-b border-linea">
                      <td className="num py-2.5 pr-4">{fmtIsoDate(localDate(l.occurredAt))}</td>
                      <td className="py-2.5 pr-4 font-medium">{machine(l.machineId)?.name}</td>
                      <td className="py-2.5 pr-4">{tk(`ui.maintKind_${l.kind}`)}</td>
                      <td className="py-2.5 pr-4 text-tinta-2">{l.description}</td>
                      <td className="num py-2.5 pr-4 text-right">
                        {l.meterValue !== null ? `${fmtNum(l.meterValue)} ${unitOf(machine(l.machineId)?.meterKind ?? "hours")}` : ""}
                      </td>
                      <td className="num py-2.5 pr-4 text-right">{l.amountPyg ? fmtGs(l.amountPyg) : ""}</td>
                      <td className="sticky right-0 w-12 bg-lino py-1 text-right">
                        <RowMenu name={machine(l.machineId)?.name ?? ""} onDelete={() => setRemoving(l)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ExportableTable>
          </div>
        )}
      </div>
      {logging && <LogModal planId={logging === "new" ? null : logging} plans={plans.data ?? []} onClose={() => setLogging(null)} />}
      {removing && (
        <ConfirmModal
          title={machine(removing.machineId)?.name ?? ""}
          message={t("ui.erpDeleteConfirm", { name: machine(removing.machineId)?.name ?? "" })}
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

function LogModal({ planId, plans, onClose }: { planId: string | null; plans: Plan[]; onClose: () => void }) {
  const machines = useMachines();
  const parties = useParties();
  const qc = useQueryClient();
  const plan = plans.find((p) => p.id === planId);
  const [machineId, setMachineId] = useState(plan?.machineId ?? machines.data?.[0]?.id ?? "");
  const [pid, setPid] = useState(planId ?? "");
  const [kind, setKind] = useState<string>(planId ? "preventive" : "repair");
  const [date, setDate] = useState(localDate(Date.now()));
  const [meter, setMeter] = useState("");
  const [description, setDescription] = useState(plan?.name ?? "");
  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("PYG");
  const save = useMutation({
    mutationFn: () =>
      post("/org/erp/maintenance/logs", {
        machineId,
        planId: pid || null,
        kind,
        date,
        meterValue: meter === "" ? null : Number(meter),
        description: description.trim() || null,
        partyId: partyId || null,
        amount: amount === "" ? null : toMinor(Number(amount), currency),
        currency: amount === "" ? null : currency,
      }),
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  const ofMachine = plans.filter((p) => p.machineId === machineId);
  return (
    <Modal title={t("ui.maintLogNew")} onClose={onClose}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.maintMachine")}>
          <Select
            value={machineId}
            onChange={(e) => {
              setMachineId(e.target.value);
              setPid("");
            }}
            options={(machines.data ?? []).map((m) => ({ value: m.id, label: m.name }))}
          />
        </Field>
        <Field label={t("ui.maintKind")}>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} options={MAINTENANCE_KINDS.map((k) => ({ value: k, label: tk(`ui.maintKind_${k}`) }))} />
        </Field>
        <div className="col-span-2">
          <Field label={t("ui.maintPlanName")}>
            <Select value={pid} onChange={(e) => setPid(e.target.value)} options={[{ value: "", label: t("ui.maintNoPlan") }, ...ofMachine.map((p) => ({ value: p.id, label: p.name }))]} />
          </Field>
        </div>
        <Field label={t("ui.costDate")}>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("ui.maintMeter")}>
          <Input type="number" min={0} step="any" value={meter} onChange={(e) => setMeter(e.target.value)} />
        </Field>
        <div className="col-span-2">
          <Field label={t("ui.maintDescription")}>
            <Input maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label={t("ui.maintWorkshop")}>
            <Select value={partyId} onChange={(e) => setPartyId(e.target.value)} options={[{ value: "", label: "—" }, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
          </Field>
        </div>
        <Field label={t("ui.maintCost")}>
          <Input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("ui.currency")}>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </Field>
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
