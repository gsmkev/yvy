/** Empleados: lista, alta y consulta compartida con las demás pestañas del personal. */
import { t } from "../../../lib/i18n";
import { fmtGs } from "../../../lib/money";
import { Button, EmptyState } from "../../ui";
import { useErpList, type FieldDef } from "../RowModal";
import { RecordList } from "../RecordList";

/** Empleado con su jornal. */
export interface Employee {
  id: string;
  name: string;
  ci: string | null;
  phone: string | null;
  dailyWagePyg: number;
}
/** Empleados de la organización. */
export const useEmployees = () => useErpList<Employee>("employees");


/**
 * Aviso cuando no hay empleados, con el botón para ir a cargarlos.
 * @param onGo se llama al tocar el botón.
 */
export function NoStaff({ onGo }: { onGo: () => void }) {
  return (
    <EmptyState
      title={t("ui.staff.emptyTitle")}
      action={
        <Button variant="primary" onClick={onGo}>
          {t("ui.staff.add")}
        </Button>
      }
    >
      {t("ui.staff.emptyHint")}
    </EmptyState>
  );
}

/** Lista de empleados con alta, cambio y baja. */
export function EmployeesList() {
  const fields: FieldDef[] = [
    { key: "name", label: t("ui.staff.name"), required: true, maxLength: 120 },
    { key: "ci", label: t("ui.staff.ci"), maxLength: 30 },
    { key: "phone", label: t("ui.staff.phone"), maxLength: 40 },
    { key: "dailyWagePyg", label: t("ui.staff.wage"), type: "number", required: true, min: 0, step: "1" },
  ];
  return (
    <RecordList<Employee>
      path="employees"
      exportName="empleados"
      newLabel={t("ui.staff.add")}
      emptyTitle={t("ui.staff.emptyTitle")}
      emptyHint={t("ui.staff.emptyHint")}
      name={(e) => e.name}
      fields={fields}
      columns={[
        { header: t("ui.staff.name"), cell: (e) => e.name },
        { header: t("ui.staff.ci"), hideBelow: "sm", cell: (e) => e.ci ?? "" },
        { header: t("ui.staff.phone"), hideBelow: "md", cell: (e) => e.phone ?? "" },
        { header: t("ui.staff.wage"), right: true, cell: (e) => fmtGs(e.dailyWagePyg) },
      ]}
    />
  );
}
