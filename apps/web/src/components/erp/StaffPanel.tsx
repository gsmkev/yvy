/** Personal: empleados con su jornal y asistencia diaria con lote y labor (E-25). */
import { useState } from "react";
import { t } from "../../lib/i18n";
import { ErrorBox, Spinner, Tabs } from "../ui";
import { AttendanceSheet } from "./staff/AttendanceSheet";
import { BalancesTab } from "./staff/BalancesTab";
import { EmployeesList, useEmployees } from "./staff/employees";

export function StaffPanel() {
  const staff = useEmployees();
  const [tab, setTab] = useState<string | null>(null);
  if (staff.isLoading) return <Spinner />;
  if (staff.error) return <ErrorBox error={staff.error} />;
  const empty = (staff.data ?? []).length === 0;
  // Sin empleados no hay nada que asistir ni saldar: se abre en Empleados
  const current = tab ?? (empty ? "employees" : "attendance");
  const tabs = [
    { id: "attendance", label: t("ui.staff.attendance") },
    { id: "balances", label: t("ui.staff.balances") },
    { id: "employees", label: t("ui.staff.employees"), count: empty ? undefined : staff.data!.length },
  ];
  const goEmployees = () => setTab("employees");
  return (
    <div className="flex flex-col gap-4">
      <Tabs<string> tabs={tabs} value={current} onChange={setTab} />
      {current === "attendance" && <AttendanceSheet staff={staff.data ?? []} onGoEmployees={goEmployees} />}
      {current === "employees" && <EmployeesList />}
      {current === "balances" && <BalancesTab onGoEmployees={goEmployees} />}
    </div>
  );
}
