/** Mantenimiento preventivo por horas o kilómetros, con historial de servicios y reparaciones. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CURRENCIES, MAINTENANCE_KINDS, localDate, toMinor, type Currency } from "@yvy/shared";
import { del, get, post } from "../../lib/api";
import { fmtIsoDate, fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { Button, type Column, ConfirmModal, DataTable, EmptyState, ErrorBox, Field, Form, FormFooter, Input, Modal, SectionHead, Select, Spinner, Tabs, toast } from "../ui";
import { useMachines } from "./MachinesPanel";
import { useErpList, type FieldDef } from "./MasterPanel";
import { RecordList } from "./RecordList";
import { SectionButton } from "./SectionButton";
import { useParties } from "./PartiesPanel";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions, RowMenu } from "./adminSlot";
import type { MaintenanceDue as Due, MaintenancePlanRow as Plan, MaintenanceLogRow as Log } from "@yvy/shared";

const unitOf = (k: "hours" | "km") => (k === "hours" ? "h" : "km");

function dueColumns(onDone: (planId: string) => void): Column<Due>[] {
  return [
    { id: "machine", header: t("ui.maint.machine"), cell: (d) => d.machine },
    { id: "name", header: t("ui.maint.planName"), hideBelow: "sm", cell: (d) => d.name },
    {
      id: "meter",
      header: t("ui.maint.meter"),
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
      header: t("ui.maint.dueCol"),
      align: "right",
      cell: (d) => (
        <span className={d.status === "overdue" ? "text-peligro" : "text-trigo-texto"}>
          {d.status === "overdue"
            ? t("ui.maint.overdue", { n: `${fmtNum(-d.remaining)} ${unitOf(d.meterKind)}` })
            : t("ui.maint.soon", { n: `${fmtNum(d.remaining)} ${unitOf(d.meterKind)}` })}
        </span>
      ),
    },
    {
      id: "_a",
      header: <span className="sr-only">{t("ui.maint.done")}</span>,
      align: "right",
      cell: (d) => (
        <Button variant="quiet" size="sm" onClick={() => onDone(d.planId)}>
          {t("ui.maint.done")}
        </Button>
      ),
    },
    ];
}

function logColumns(machine: (id: string) => { name: string; meterKind: "hours" | "km" } | undefined, onRemove: (l: Log) => void): Column<Log>[] {
  return [
    { id: "date", header: t("ui.cost.date"), cell: (l) => <span className="whitespace-nowrap">{fmtIsoDate(localDate(l.occurredAt))}</span> },
    {
      id: "machine",
      header: t("ui.maint.machine"),
      cell: (l) => (
        <>
          {machine(l.machineId)?.name}
          <span className="block text-meta font-normal text-tinta-2 sm:hidden">{tk(`ui.maint.kind_${l.kind}`)}</span>
        </>
      ),
    },
    { id: "kind", header: t("ui.maint.kind"), hideBelow: "sm", cell: (l) => tk(`ui.maint.kind_${l.kind}`) },
    { id: "desc", header: t("ui.maint.description"), hideBelow: "lg", cell: (l) => <span className="text-tinta-2">{l.description}</span> },
    {
      id: "meter",
      header: t("ui.maint.meter"),
      align: "right",
      hideBelow: "md",
      cell: (l) => (l.meterValue !== null ? `${fmtNum(l.meterValue)} ${unitOf(machine(l.machineId)?.meterKind ?? "hours")}` : ""),
    },
    { id: "cost", header: t("ui.maint.cost"), align: "right", cell: (l) => (l.amountPyg ? fmtGs(l.amountPyg) : "") },
    { id: "_a", header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>, align: "right", width: "3rem", cell: (l) => <RowMenu name={machine(l.machineId)?.name ?? ""} onDelete={() => onRemove(l)} /> },
    ];
}

/** Mantenimiento preventivo, servicios y reparaciones de las máquinas. */
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
      toast(t("ui.erp.deleted"));
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
      label: t("ui.maint.machine"),
      type: "select",
      required: true,
      initial: machines.data?.[0]?.id ?? "",
      options: (machines.data ?? []).map((m) => ({ value: m.id, label: m.name })),
    },
    { key: "name", label: t("ui.maint.planName"), required: true, maxLength: 80 },
    { key: "everyUnits", label: t("ui.maint.every"), type: "number", required: true, min: 1, hint: t("ui.maint.everyHint") },
    { key: "lastDoneMeter", label: t("ui.maint.lastDone"), type: "number", min: 0, hint: t("ui.maint.lastDoneHint") },
  ];
  if ((machines.data ?? []).length === 0)
    return (
      <EmptyState title={t("ui.maint.noMachinesTitle")} action={<SectionButton to="machines" primary>{t("ui.maint.goMachines")}</SectionButton>}>
        {t("ui.maint.noMachinesHint")}
      </EmptyState>
    );
  const dueCols = dueColumns(setLogging);
  const logCols = logColumns(machine, setRemoving);
  const history = logs.data ?? [];
  return (
    <div className="flex flex-col gap-5">
      <HeaderActions>
        <Button variant="primary" onClick={() => setLogging("new")}>
          {t("ui.maint.logNew")}
        </Button>
      </HeaderActions>
      {due.data && due.data.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHead title={t("ui.maint.dueTitle")} count={due.data.length} />
          <DataTable columns={dueCols} rows={due.data} rowKey={(d) => d.planId} caption={t("ui.maint.dueTitle")} />
        </section>
      )}
      <Tabs<string>
        tabs={[
          { id: "history", label: t("ui.maint.historyTitle"), count: history.length || undefined },
          { id: "plans", label: t("ui.maint.plansTitle"), count: (plans.data ?? []).length || undefined },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "history" &&
        (history.length === 0 ? (
          <EmptyState
            title={t("ui.maint.historyEmptyTitle")}
            action={
              <Button variant="primary" onClick={() => setLogging("new")}>
                {t("ui.maint.logNew")}
              </Button>
            }
          >
            {t("ui.maint.historyEmptyHint")}
          </EmptyState>
        ) : (
          <ExportableTable name="mantenimiento-historial">
            <DataTable columns={logCols} rows={history} rowKey={(l) => l.id} caption={t("ui.maint.historyTitle")} />
          </ExportableTable>
        ))}
      {tab === "plans" && (
        <RecordList<Plan>
          inline
          path="maintenance-plans"
          exportName="mantenimiento-planes"
          newLabel={t("ui.maint.planNew")}
          emptyTitle={t("ui.maint.plansEmptyTitle")}
          emptyHint={t("ui.maint.plansEmptyHint")}
          name={(p) => p.name}
          fields={fields}
          columns={[
            { header: t("ui.maint.machine"), cell: (p) => machine(p.machineId)?.name },
            { header: t("ui.maint.planName"), cell: (p) => p.name },
            { header: t("ui.maint.every"), right: true, cell: (p) => `${fmtNum(p.everyUnits)} ${unitOf(machine(p.machineId)?.meterKind ?? "hours")}` },
            { header: t("ui.maint.lastDone"), right: true, hideBelow: "sm", cell: (p) => `${fmtNum(p.lastDoneMeter)} ${unitOf(machine(p.machineId)?.meterKind ?? "hours")}` },
          ]}
        />
      )}
      {logging && <LogModal planId={logging === "new" ? null : logging} plans={plans.data ?? []} onClose={() => setLogging(null)} />}
      {removing && (
        <ConfirmModal
          title={machine(removing.machineId)?.name ?? ""}
          message={t("ui.erp.deleteConfirm", { name: machine(removing.machineId)?.name ?? "" })}
          confirmLabel={t("ui.common.delete")}
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
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  const ofMachine = plans.filter((p) => p.machineId === machineId);
  return (
    <Modal title={t("ui.maint.logNew")} onClose={onClose}>
      <Form onSubmit={() => save.mutate()}>
        <Field label={t("ui.maint.machine")}>
          <Select
            value={machineId}
            onChange={(e) => {
              setMachineId(e.target.value);
              setPid("");
            }}
            options={(machines.data ?? []).map((m) => ({ value: m.id, label: m.name }))}
          />
        </Field>
        <Field label={t("ui.maint.kind")}>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} options={MAINTENANCE_KINDS.map((k) => ({ value: k, label: tk(`ui.maint.kind_${k}`) }))} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("ui.maint.planName")}>
            <Select value={pid} onChange={(e) => setPid(e.target.value)} options={[{ value: "", label: t("ui.maint.noPlan") }, ...ofMachine.map((p) => ({ value: p.id, label: p.name }))]} />
          </Field>
        </div>
        <Field label={t("ui.cost.date")}>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("ui.maint.meter")}>
          <Input type="number" min={0} step="any" value={meter} onChange={(e) => setMeter(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("ui.maint.description")}>
            <Input maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("ui.maint.workshop")}>
            <Select value={partyId} onChange={(e) => setPartyId(e.target.value)} options={[{ value: "", label: "—" }, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
          </Field>
        </div>
        <Field label={t("ui.maint.cost")}>
          <Input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("ui.common.currency")}>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </Field>
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}
