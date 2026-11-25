/** Columnas de la planilla de asistencia y de su historial reciente. */
import { fmtIsoDate } from "../../../lib/format";
import { t } from "../../../lib/i18n";
import { fmtGs } from "../../../lib/money";
import { type Column, Input, Select } from "../../ui";
import { RowMenu } from "../adminSlot";
import type { Employee } from "./employees";

/** Asistencia cargada de un empleado en un día. */
export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  days: number;
  plotId: string | null;
  labor: string | null;
  wagePyg: number;
}

/** Lo que se marca en la planilla para un empleado. */
export interface Mark {
  days: "" | "1" | "0.5";
  plotId: string;
  labor: string;
}

/** Datos que necesita la planilla del día: marcas, lotes, lo ya cargado y cómo cambiar una marca. */
export interface SheetContext {
  marks: Record<string, Mark>;
  plots: { id: string; name: string }[];
  loaded: Map<string, number>;
  set: (id: string, patch: Partial<Mark>) => void;
}

/** Columnas de la planilla del día. */
export function sheetColumns({ marks, plots, loaded, set }: SheetContext): Column<Employee>[] {
  return [
    { id: "name", header: t("ui.staff.name"), cell: (e) => e.name },
    {
      id: "days",
      header: t("ui.att.days"),
      cell: (e) => (
        <Select
          aria-label={`${t("ui.att.days")}: ${e.name}`}
          value={marks[e.id]?.days ?? ""}
          onChange={(ev) => set(e.id, { days: ev.target.value as Mark["days"] })}
          options={[
            { value: "", label: "—" },
            { value: "1", label: t("ui.att.full") },
            { value: "0.5", label: t("ui.att.half") },
          ]}
        />
      ),
    },
    {
      id: "plot",
      header: t("ui.cost.plot"),
      hideBelow: "md",
      cell: (e) => (
        <Select
          aria-label={`${t("ui.cost.plot")}: ${e.name}`}
          value={marks[e.id]?.plotId ?? ""}
          onChange={(ev) => set(e.id, { plotId: ev.target.value })}
          options={[{ value: "", label: t("ui.cost.none") }, ...plots.map((p) => ({ value: p.id, label: p.name }))]}
        />
      ),
    },
    {
      id: "labor",
      header: t("ui.att.labor"),
      hideBelow: "md",
      cell: (e) => <Input aria-label={`${t("ui.att.labor")}: ${e.name}`} maxLength={120} value={marks[e.id]?.labor ?? ""} onChange={(ev) => set(e.id, { labor: ev.target.value })} />,
    },
    { id: "loaded", header: t("ui.att.loaded"), align: "right", cell: (e) => <span className="text-tinta-2">{loaded.get(e.id) ? `${loaded.get(e.id)} d` : ""}</span> },
  ];
}

/** Columnas del historial; el empleado es el título de la tarjeta en el celular. */
export function historyColumns(name: (id: string) => string, onRemove: (id: string) => void): Column<Attendance>[] {
  return [
    { id: "date", header: t("ui.cost.date"), cell: (a) => fmtIsoDate(a.date) },
    { id: "name", header: t("ui.staff.name"), mobile: "title", cell: (a) => name(a.employeeId) },
    { id: "days", header: t("ui.att.days"), align: "right", cell: (a) => (a.days === 1 ? t("ui.att.full") : t("ui.att.half")) },
    { id: "labor", header: t("ui.att.labor"), hideBelow: "md", cell: (a) => <span className="text-tinta-2">{a.labor}</span> },
    { id: "wage", header: t("ui.staff.wage"), align: "right", hideBelow: "sm", cell: (a) => fmtGs(a.wagePyg) },
    { id: "_actions", header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>, align: "right", width: "3rem", cell: (a) => <RowMenu name={fmtIsoDate(a.date)} onDelete={() => onRemove(a.id)} /> },
  ];
}
