/** Mantenimiento preventivo por horas o kilómetros, con historial de servicios y reparaciones (E-22). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CURRENCIES, MAINTENANCE_KINDS, localDate, toMinor, type Currency } from "@yvy/shared";
import { del, get, post } from "../../lib/api";
import { fmtIsoDate, fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { Button, ConfirmModal, DataTable, EmptyState, ErrorBox, Field, Input, Modal, SectionHead, Select, Spinner, Tabs, toast, type Column } from "../ui";
import { useMachines } from "./MachinesPanel";
import { useErpList, type FieldDef } from "./MasterPanel";
import { RecordList } from "./RecordList";
import { SectionButton } from "./SectionButton";
import { useParties } from "./PartiesPanel";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions, RowMenu } from "./adminSlot";
import type { MaintenanceDue as Due, MaintenancePlanRow as Plan, MaintenanceLogRow as Log } from "@yvy/shared";

const unitOf = (k: "hours" | "km") => (k === "hours" ? "h" : "km");

export function MaintenancePanel() {
  const machines = useMachines();
  const plans = useErpList<Plan>("maintenance-plans");
  const due = useQuery({ queryKey: ["erp", "maintenance-due"], queryFn: () => get<Due[]>("/org/erp/maintenance/due") });
  const logs = useQuery({ queryKey: ["erp", "maintenance-logs"], queryFn: () => get<Log[]>("/org/erp/maintenance/logs") });
  const [logging, setLogging] = useState<string | null | "new">(null);
  const [removing, setRemoving] = useState<Log | null>(null);
  const [tab, setTab] = useState("history");
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
  if ((machines.data ?? []).length === 0)
    return (
      <EmptyState title={t("ui.maintNoMachinesTitle")} action={<SectionButton to="machines" primary>{t("ui.maintGoMachines")}</SectionButton>}>
        {t("ui.maintNoMachinesHint")}
      </EmptyState>
    );
  const dueCols: Column<Due>[] = [
    { id: "machine", header: t("ui.maintMachine"), cell: (d) => d.machine },
    { id: "name", header: t("ui.maintPlanName"), hideBelow: "sm", cell: (d) => d.name },
    {
      id: "meter",
      header: t("ui.maintMeter"),
      align: "right",
      hideBelow: "md",
      cell: (d) => (
        <span className="text-tinta-2">
          {fmtNum(d.meter)} / {fmtNum(d.dueAt)} {unitOf(d.meterKind)}
        </span>
      ),
    },
    {
      id: "left",
      header: t("ui.maintDueCol"),
      align: "right",
      cell: (d) => (
        <span className={d.status === "overdue" ? "text-peligro" : "text-trigo-texto"}>
          {d.status === "overdue"
            ? t("ui.maintOverdue", { n: `${fmtNum(-d.remaining)} ${unitOf(d.meterKind)}` })
            : t("ui.maintSoon", { n: `${fmtNum(d.remaining)} ${unitOf(d.meterKind)}` })}
        </span>
      ),
    },
    {
      id: "_a",
      header: <span className="sr-only">{t("ui.maintDone")}</span>,
      align: "right",
      cell: (d) => (
        <Button variant="quiet" size="sm" onClick={() => setLogging(d.planId)}>
          {t("ui.maintDone")}
        </Button>
      ),
    },
  ];
  const logCols: Column<Log>[] = [
    { id: "date", header: t("ui.costDate"), cell: (l) => <span className="whitespace-nowrap">{fmtIsoDate(localDate(l.occurredAt))}</span> },
    {
      id: "machine",
      header: t("ui.maintMachine"),
      cell: (l) => (
        <>
          {machine(l.machineId)?.name}
          <span className="block text-meta font-normal text-tinta-2 sm:hidden">{tk(`ui.maintKind_${l.kind}`)}</span>
        </>
      ),
    },
    { id: "kind", header: t("ui.maintKind"), hideBelow: "sm", cell: (l) => tk(`ui.maintKind_${l.kind}`) },
    { id: "desc", header: t("ui.maintDescription"), hideBelow: "lg", cell: (l) => <span className="text-tinta-2">{l.description}</span> },
    {
      id: "meter",
      header: t("ui.maintMeter"),
      align: "right",
      hideBelow: "md",
      cell: (l) => (l.meterValue !== null ? `${fmtNum(l.meterValue)} ${unitOf(machine(l.machineId)?.meterKind ?? "hours")}` : ""),
    },
    { id: "cost", header: t("ui.maintCost"), align: "right", cell: (l) => (l.amountPyg ? fmtGs(l.amountPyg) : "") },
    { id: "_a", header: <span className="sr-only">{t("ui.rowActionsHeader")}</span>, align: "right", width: "3rem", cell: (l) => <RowMenu name={machine(l.machineId)?.name ?? ""} onDelete={() => setRemoving(l)} /> },
  ];
  const history = logs.data ?? [];
  return (
    <div className="flex flex-col gap-5">
      <HeaderActions>
        <Button variant="primary" onClick={() => setLogging("new")}>
          {t("ui.maintLogNew")}
        </Button>
      </HeaderActions>
      {due.data && due.data.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHead title={t("ui.maintDueTitle")} count={due.data.length} />
          <DataTable columns={dueCols} rows={due.data} rowKey={(d) => d.planId} caption={t("ui.maintDueTitle")} />
        </section>
      )}
      <Tabs<string>
        tabs={[
          { id: "history", label: t("ui.maintHistoryTitle"), count: history.length || undefined },
          { id: "plans", label: t("ui.maintPlansTitle"), count: (plans.data ?? []).length || undefined },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "history" &&
        (history.length === 0 ? (
          <EmptyState
            title={t("ui.maintHistoryEmptyTitle")}
            action={
              <Button variant="primary" onClick={() => setLogging("new")}>
                {t("ui.maintLogNew")}
              </Button>
            }
          >
            {t("ui.maintHistoryEmptyHint")}
          </EmptyState>
        ) : (
          <ExportableTable name="mantenimiento-historial">
            <DataTable columns={logCols} rows={history} rowKey={(l) => l.id} caption={t("ui.maintHistoryTitle")} />
          </ExportableTable>
        ))}
      {tab === "plans" && (
        <RecordList<Plan>
          inline
          path="maintenance-plans"
          exportName="mantenimiento-planes"
          newLabel={t("ui.maintPlanNew")}
          emptyTitle={t("ui.maintPlansEmptyTitle")}
          emptyHint={t("ui.maintPlansEmptyHint")}
          name={(p) => p.name}
          fields={fields}
          columns={[
            { header: t("ui.maintMachine"), cell: (p) => machine(p.machineId)?.name },
            { header: t("ui.maintPlanName"), cell: (p) => p.name },
            { header: t("ui.maintEvery"), right: true, cell: (p) => `${fmtNum(p.everyUnits)} ${unitOf(machine(p.machineId)?.meterKind ?? "hours")}` },
            { header: t("ui.maintLastDone"), right: true, hideBelow: "sm", cell: (p) => `${fmtNum(p.lastDoneMeter)} ${unitOf(machine(p.machineId)?.meterKind ?? "hours")}` },
          ]}
        />
      )}
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
