/** Mantenimiento preventivo por horas o kilómetros, con historial de servicios y reparaciones. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MaintenanceDue as Due, MaintenanceLogRow as Log, MaintenancePlanRow as Plan } from "@yvy/shared";
import { del, get } from "../../lib/api";
import { t } from "../../lib/i18n";
import { Button, ConfirmModal, DataTable, EmptyState, ErrorBox, SectionHead, Spinner, Tabs, toast } from "../ui";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions } from "./adminSlot";
import { useMachines } from "./MachinesPanel";
import { useErpList } from "./RowModal";
import { SectionButton } from "./SectionButton";
import { LogModal } from "./maintenance/LogModal";
import { PlansList } from "./maintenance/PlansList";
import { dueColumns, logColumns, type MachineOf } from "./maintenance/maintenanceColumns";

function useRemoveLog(onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (l: Log) => del(`/org/erp/maintenance/logs/${l.id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      onDone();
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
}

/** Historial de servicios; sin ninguno, un vacío con la acción de registrar el primero. */
function HistoryTab({ history, columns, onNew }: { history: Log[]; columns: ReturnType<typeof logColumns>; onNew: () => void }) {
  if (history.length === 0) {
    return (
      <EmptyState
        title={t("ui.maint.historyEmptyTitle")}
        action={
          <Button variant="primary" onClick={onNew}>
            {t("ui.maint.logNew")}
          </Button>
        }
      >
        {t("ui.maint.historyEmptyHint")}
      </EmptyState>
    );
  }
  return (
    <ExportableTable name="mantenimiento-historial">
      <DataTable columns={columns} rows={history} rowKey={(l) => l.id} caption={t("ui.maint.historyTitle")} />
    </ExportableTable>
  );
}

interface HistoryAndPlansProps {
  history: Log[];
  planCount: number;
  machine: MachineOf;
  machines: { id: string; name: string }[];
  onNew: () => void;
  onRemove: (l: Log) => void;
}

/** Pestañas de historial y de planes. */
function HistoryAndPlans({ history, planCount, machine, machines, onNew, onRemove }: HistoryAndPlansProps) {
  const [tab, setTab] = useState("history");
  return (
    <>
      <Tabs<string>
        tabs={[
          { id: "history", label: t("ui.maint.historyTitle"), count: history.length || undefined },
          { id: "plans", label: t("ui.maint.plansTitle"), count: planCount || undefined },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "history" && <HistoryTab history={history} columns={logColumns(machine, onRemove)} onNew={onNew} />}
      {tab === "plans" && <PlansList machine={machine} machines={machines} />}
    </>
  );
}

/** Confirmación de baja de un servicio del historial. */
function RemoveLog({ log, name, onClose }: { log: Log; name: string; onClose: () => void }) {
  const remove = useRemoveLog(onClose);
  return (
    <ConfirmModal
      title={name}
      message={t("ui.erp.deleteConfirm", { name })}
      confirmLabel={t("ui.common.delete")}
      pending={remove.isPending}
      error={remove.error}
      onConfirm={() => remove.mutate(log)}
      onClose={onClose}
    />
  );
}

/** Mantenimientos por vencer, con la acción de registrar el servicio. */
function DueSection({ due, onDone }: { due: Due[]; onDone: (planId: string) => void }) {
  if (due.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionHead title={t("ui.maint.dueTitle")} count={due.length} />
      <DataTable columns={dueColumns(onDone)} rows={due} rowKey={(d) => d.planId} caption={t("ui.maint.dueTitle")} />
    </section>
  );
}

/** Mantenimiento preventivo, servicios y reparaciones de las máquinas. */
export function MaintenancePanel() {
  const machines = useMachines();
  const plans = useErpList<Plan>("maintenance-plans");
  const due = useQuery({ queryKey: ["erp", "maintenance-due"], queryFn: () => get<Due[]>("/org/erp/maintenance/due") });
  const logs = useQuery({ queryKey: ["erp", "maintenance-logs"], queryFn: () => get<Log[]>("/org/erp/maintenance/logs") });
  const [logging, setLogging] = useState<string | null | "new">(null);
  const [removing, setRemoving] = useState<Log | null>(null);
  if (machines.isLoading || logs.isLoading || plans.isLoading) return <Spinner />;
  if (logs.error) return <ErrorBox error={logs.error} />;
  if ((machines.data ?? []).length === 0) {
    return (
      <EmptyState title={t("ui.maint.noMachinesTitle")} action={<SectionButton to="machines" primary>{t("ui.maint.goMachines")}</SectionButton>}>
        {t("ui.maint.noMachinesHint")}
      </EmptyState>
    );
  }
  const machine = (id: string) => machines.data?.find((m) => m.id === id);
  const history = logs.data ?? [];
  return (
    <div className="flex flex-col gap-5">
      <HeaderActions>
        <Button variant="primary" onClick={() => setLogging("new")}>
          {t("ui.maint.logNew")}
        </Button>
      </HeaderActions>
      <DueSection due={due.data ?? []} onDone={setLogging} />
      <HistoryAndPlans history={history} planCount={(plans.data ?? []).length} machine={machine} machines={machines.data ?? []} onNew={() => setLogging("new")} onRemove={setRemoving} />
      {logging && <LogModal planId={logging === "new" ? null : logging} plans={plans.data ?? []} onClose={() => setLogging(null)} />}
      {removing && <RemoveLog log={removing} name={machine(removing.machineId)?.name ?? ""} onClose={() => setRemoving(null)} />}
    </div>
  );
}
