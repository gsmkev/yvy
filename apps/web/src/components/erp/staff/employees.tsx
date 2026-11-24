import { t } from "../../../lib/i18n";
import { fmtGs } from "../../../lib/money";
import { Button, EmptyState } from "../../ui";
import { useErpList, type FieldDef } from "../MasterPanel";
import { RecordList } from "../RecordList";

export interface Employee {
  id: string;
  name: string;
  ci: string | null;
  phone: string | null;
  dailyWagePyg: number;
}
export const useEmployees = () => useErpList<Employee>("employees");


export function NoStaff({ onGo }: { onGo: () => void }) {
  return (
    <EmptyState
      title={t("ui.staffEmptyTitle")}
      action={
        <Button variant="primary" onClick={onGo}>
          {t("ui.staffAdd")}
        </Button>
      }
    >
      {t("ui.staffEmptyHint")}
    </EmptyState>
  );
}

export function EmployeesList() {
  const fields: FieldDef[] = [
    { key: "name", label: t("ui.staffName"), required: true, maxLength: 120 },
    { key: "ci", label: t("ui.staffCi"), maxLength: 30 },
    { key: "phone", label: t("ui.staffPhone"), maxLength: 40 },
    { key: "dailyWagePyg", label: t("ui.staffWage"), type: "number", required: true, min: 0, step: "1" },
  ];
  return (
    <RecordList<Employee>
      path="employees"
      exportName="empleados"
      newLabel={t("ui.staffAdd")}
      emptyTitle={t("ui.staffEmptyTitle")}
      emptyHint={t("ui.staffEmptyHint")}
      name={(e) => e.name}
      fields={fields}
      columns={[
        { header: t("ui.staffName"), cell: (e) => e.name },
        { header: t("ui.staffCi"), hideBelow: "sm", cell: (e) => e.ci ?? "" },
        { header: t("ui.staffPhone"), hideBelow: "md", cell: (e) => e.phone ?? "" },
        { header: t("ui.staffWage"), right: true, cell: (e) => fmtGs(e.dailyWagePyg) },
      ]}
    />
  );
}
