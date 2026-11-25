/** Fila y columnas de la tabla de costo de labor propia contra contratista. */
import type { CONTRACTOR_SERVICES } from "@yvy/shared";
import { t, tk } from "../../../lib/i18n";
import { fmtGs } from "../../../lib/money";
import type { Column } from "../../ui";
import { RowMenu } from "../adminSlot";

/** Costo por hora y por hectárea de una máquina propia, frente al contratista del mismo servicio. */
export interface Row {
  machineId: string;
  machine: string;
  service: (typeof CONTRACTOR_SERVICES)[number];
  own: { fuelPerHour: number; operatorPerHour: number; depreciationPerHour: number; totalPerHour: number; perHa: number | null };
  fuelLitersPerHour: number | null;
  fuelPricePyg: number | null;
  contractor: { id: string; name: string; perHa: number | null; perHour: number | null } | null;
  verdict: { basis: "ha" | "hour"; savingPyg: number; cheaper: "own" | "contractor" } | null;
}

/** Columnas de la tabla; `onEdit` abre el perfil de costo de una máquina y `onRemove` lo borra. */
export function laborColumns(onEdit: (r: Row) => void, onRemove: (machineId: string) => void): Column<Row>[] {
  return [
    {
      id: "machine",
      header: t("ui.labor.machine"),
      cell: (r) => (
        <>
          {r.machine}
          <span className="block text-meta font-normal text-tinta-2">{tk(`ui.contractor.service_${r.service}`)}</span>
        </>
      ),
    },
    { id: "fuel", header: t("ui.labor.fuel"), align: "right", hideBelow: "lg", cell: (r) => fmtGs(r.own.fuelPerHour) },
    { id: "operator", header: t("ui.labor.operator"), align: "right", hideBelow: "lg", cell: (r) => fmtGs(r.own.operatorPerHour) },
    { id: "depr", header: t("ui.labor.depreciation"), align: "right", hideBelow: "lg", cell: (r) => fmtGs(r.own.depreciationPerHour) },
    { id: "hour", header: t("ui.labor.ownHour"), align: "right", hideBelow: "sm", cell: (r) => <span className="font-medium">{fmtGs(r.own.totalPerHour)}</span> },
    { id: "ha", header: t("ui.labor.ownHa"), align: "right", cell: (r) => <span className="font-medium">{r.own.perHa === null ? "—" : fmtGs(r.own.perHa)}</span> },
    {
      id: "contractor",
      header: t("ui.labor.contractor"),
      hideBelow: "md",
      cell: (r) =>
        r.contractor ? (
          <>
            {r.contractor.name}
            <span className="num block text-meta text-tinta-2">{r.contractor.perHa !== null ? `${fmtGs(r.contractor.perHa)} / ha` : `${fmtGs(r.contractor.perHour ?? 0)} / h`}</span>
          </>
        ) : (
          <span className="text-tinta-2">{t("ui.labor.noContractor")}</span>
        ),
    },
    {
      id: "verdict",
      header: t("ui.labor.verdict"),
      hideBelow: "md",
      cell: (r) =>
        r.verdict ? (
          <span className={r.verdict.cheaper === "own" ? "text-accion" : "text-trigo-texto"}>
            {t(r.verdict.cheaper === "own" ? "ui.labor.ownCheaper" : "ui.labor.contractorCheaper", { n: fmtGs(Math.abs(r.verdict.savingPyg)), unit: r.verdict.basis === "ha" ? "ha" : "h" })}
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "_a",
      header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
      align: "right",
      width: "3rem",
      cell: (r) => <RowMenu name={r.machine} onEdit={() => onEdit(r)} onDelete={() => onRemove(r.machineId)} />,
    },
  ];
}
