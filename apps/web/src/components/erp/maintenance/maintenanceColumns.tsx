/** Columnas de las tablas de mantenimiento: vencimientos e historial. */
import { localDate, type MaintenanceDue as Due, type MaintenanceLogRow as Log } from "@yvy/shared";
import { fmtIsoDate, fmtNum } from "../../../lib/format";
import { t, tk } from "../../../lib/i18n";
import { fmtGs } from "../../../lib/money";
import { Button, type Column } from "../../ui";
import { RowMenu } from "../adminSlot";

/** Unidad del medidor: horas o kilómetros. */
export const unitOf = (k: "hours" | "km") => (k === "hours" ? "h" : "km");

/** Qué máquina es y cómo mide su uso. */
export type MachineOf = (id: string) => { name: string; meterKind: "hours" | "km" } | undefined;

/** Columnas de los mantenimientos por vencer; `onDone` registra el servicio de un plan. */
export function dueColumns(onDone: (planId: string) => void): Column<Due>[] {
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
      cell: (d) => {
        const overdue = d.status === "overdue";
        const n = `${fmtNum(overdue ? -d.remaining : d.remaining)} ${unitOf(d.meterKind)}`;
        return <span className={overdue ? "text-peligro" : "text-trigo-texto"}>{t(overdue ? "ui.maint.overdue" : "ui.maint.soon", { n })}</span>;
      },
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

/** Columnas del historial; la máquina es el título de la tarjeta en el celular. */
export function logColumns(machine: MachineOf, onRemove: (l: Log) => void): Column<Log>[] {
  return [
    { id: "date", header: t("ui.cost.date"), cell: (l) => <span className="whitespace-nowrap">{fmtIsoDate(localDate(l.occurredAt))}</span> },
    {
      id: "machine",
      header: t("ui.maint.machine"),
      mobile: "title",
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
