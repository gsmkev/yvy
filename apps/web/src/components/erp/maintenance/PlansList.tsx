/** Planes de mantenimiento preventivo: por cuántas horas o kilómetros toca cada servicio. */
import type { MaintenancePlanRow as Plan } from "@yvy/shared";
import { fmtNum } from "../../../lib/format";
import { t } from "../../../lib/i18n";
import { RecordList } from "../RecordList";
import type { FieldDef } from "../RowModal";
import { unitOf, type MachineOf } from "./maintenanceColumns";

/** Lista con alta, cambio y baja de los planes; `machines` son las opciones de máquina. */
export function PlansList({ machine, machines }: { machine: MachineOf; machines: { id: string; name: string }[] }) {
  const fields: FieldDef[] = [
    {
      key: "machineId",
      label: t("ui.maint.machine"),
      type: "select",
      required: true,
      initial: machines[0]?.id ?? "",
      options: machines.map((m) => ({ value: m.id, label: m.name })),
    },
    { key: "name", label: t("ui.maint.planName"), required: true, maxLength: 80 },
    { key: "everyUnits", label: t("ui.maint.every"), type: "number", required: true, min: 1, hint: t("ui.maint.everyHint") },
    { key: "lastDoneMeter", label: t("ui.maint.lastDone"), type: "number", min: 0, hint: t("ui.maint.lastDoneHint") },
  ];
  const unit = (p: Plan) => unitOf(machine(p.machineId)?.meterKind ?? "hours");
  return (
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
        { header: t("ui.maint.every"), right: true, cell: (p) => `${fmtNum(p.everyUnits)} ${unit(p)}` },
        { header: t("ui.maint.lastDone"), right: true, hideBelow: "sm", cell: (p) => `${fmtNum(p.lastDoneMeter)} ${unit(p)}` },
      ]}
    />
  );
}
