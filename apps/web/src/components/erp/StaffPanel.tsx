/** Personal: empleados con su jornal y asistencia diaria con lote y labor (E-25). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EMPLOYEE_PAYMENT_KINDS, localDate, type PayrollRow } from "@yvy/shared";
import { del, get, post, qs } from "../../lib/api";
import { fmtIsoDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { tablesToExcel } from "../../lib/tableExport";
import { useFarm, useFarms } from "../../lib/queries";
import { Button, type Column, DataTable, EmptyState, ErrorBox, Field, FilterBar, FormFooter, Input, Modal, SectionHead, Select, Spinner, Tabs, toast } from "../ui";
import { ExportableTable } from "../ExportableTable";
import { useErpList, type FieldDef } from "./MasterPanel";
import { RecordList } from "./RecordList";
import { HeaderActions, RowMenu } from "./adminSlot";

interface Employee {
  id: string;
  name: string;
  ci: string | null;
  phone: string | null;
  dailyWagePyg: number;
}
const useEmployees = () => useErpList<Employee>("employees");

interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  days: number;
  plotId: string | null;
  labor: string | null;
  wagePyg: number;
}



export function StaffPanel() {
  const staff = useEmployees();
  const [tab, setTab] = useState<string | null>(null);
  if (staff.isLoading) return <Spinner />;
  if (staff.error) return <ErrorBox error={staff.error} />;
  const empty = (staff.data ?? []).length === 0;
  // Sin empleados no hay nada que asistir ni saldar: se abre en Empleados
  const current = tab ?? (empty ? "employees" : "attendance");
  const tabs = [
    { id: "attendance", label: t("ui.staffAttendance") },
    { id: "balances", label: t("ui.staffBalances") },
    { id: "employees", label: t("ui.staffEmployees"), count: empty ? undefined : staff.data!.length },
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

function NoStaff({ onGo }: { onGo: () => void }) {
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

function EmployeesList() {
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

interface Mark {
  days: "" | "1" | "0.5";
  plotId: string;
  labor: string;
}

/** Planilla del día: por cada empleado, día completo, medio día o ausente, con el lote y la labor. */
function AttendanceSheet({ staff: list, onGoEmployees }: { staff: Employee[]; onGoEmployees: () => void }) {
  const farms = useFarms();
  const [date, setDate] = useState(localDate(Date.now()));
  const [farmId, setFarmId] = useState("");
  const farm = useFarm(farmId, !!farmId);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const qc = useQueryClient();
  const day = useQuery({ queryKey: ["erp", "attendance", date], queryFn: () => get<Attendance[]>(`/org/erp/attendance${qs({ from: date, to: date })}`) });
  const recent = useQuery({ queryKey: ["erp", "attendance", "recent"], queryFn: () => get<Attendance[]>("/org/erp/attendance") });
  const marked = Object.values(marks).filter((m) => m.days).length;
  const save = useMutation({
    mutationFn: () => {
      const entries = Object.entries(marks)
        .filter(([, m]) => m.days)
        .map(([employeeId, m]) => ({
          employeeId,
          days: Number(m.days),
          farmId: m.plotId ? undefined : farmId || undefined,
          plotId: m.plotId || undefined,
          labor: m.labor || undefined,
        }));
      return post("/org/erp/attendance", { date, entries });
    },
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      setMarks({});
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/erp/attendance/${id}`),
    onSuccess: () => {
      toast(t("ui.erpDeleted"));
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (list.length === 0) return <NoStaff onGo={onGoEmployees} />;
  const name = (id: string) => list.find((e) => e.id === id)?.name ?? "?";
  const loaded = new Map<string, number>();
  for (const a of day.data ?? []) loaded.set(a.employeeId, (loaded.get(a.employeeId) ?? 0) + a.days);
  const set = (id: string, patch: Partial<Mark>) => setMarks({ ...marks, [id]: { days: "", plotId: "", labor: "", ...marks[id], ...patch } });
  const sheet: Column<Employee>[] = [
    { id: "name", header: t("ui.staffName"), cell: (e) => e.name },
    {
      id: "days",
      header: t("ui.attDays"),
      cell: (e) => (
        <Select
          aria-label={`${t("ui.attDays")}: ${e.name}`}
          value={marks[e.id]?.days ?? ""}
          onChange={(ev) => set(e.id, { days: ev.target.value as Mark["days"] })}
          options={[
            { value: "", label: "—" },
            { value: "1", label: t("ui.attFull") },
            { value: "0.5", label: t("ui.attHalf") },
          ]}
        />
      ),
    },
    {
      id: "plot",
      header: t("ui.costPlot"),
      hideBelow: "md",
      cell: (e) => (
        <Select
          aria-label={`${t("ui.costPlot")}: ${e.name}`}
          value={marks[e.id]?.plotId ?? ""}
          onChange={(ev) => set(e.id, { plotId: ev.target.value })}
          options={[{ value: "", label: t("ui.costNone") }, ...(farm.data?.plots ?? []).map((p) => ({ value: p.id, label: p.name }))]}
        />
      ),
    },
    {
      id: "labor",
      header: t("ui.attLabor"),
      hideBelow: "md",
      cell: (e) => <Input aria-label={`${t("ui.attLabor")}: ${e.name}`} maxLength={120} value={marks[e.id]?.labor ?? ""} onChange={(ev) => set(e.id, { labor: ev.target.value })} />,
    },
    { id: "loaded", header: t("ui.attLoaded"), align: "right", cell: (e) => <span className="text-tinta-2">{loaded.get(e.id) ? `${loaded.get(e.id)} d` : ""}</span> },
  ];
  const history: Column<Attendance>[] = [
    { id: "date", header: t("ui.costDate"), cell: (a) => fmtIsoDate(a.date) },
    { id: "name", header: t("ui.staffName"), cell: (a) => name(a.employeeId) },
    { id: "days", header: t("ui.attDays"), align: "right", cell: (a) => (a.days === 1 ? t("ui.attFull") : t("ui.attHalf")) },
    { id: "labor", header: t("ui.attLabor"), hideBelow: "md", cell: (a) => <span className="text-tinta-2">{a.labor}</span> },
    { id: "wage", header: t("ui.staffWage"), align: "right", hideBelow: "sm", cell: (a) => fmtGs(a.wagePyg) },
    { id: "_actions", header: <span className="sr-only">{t("ui.rowActionsHeader")}</span>, align: "right", width: "3rem", cell: (a) => <RowMenu name={fmtIsoDate(a.date)} onDelete={() => remove.mutate(a.id)} /> },
  ];
  const past = (recent.data ?? []).slice(0, 40);
  return (
    <div className="flex flex-col gap-5">
      {marked > 0 && (
        <HeaderActions>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {t("ui.attSave", { n: marked })}
          </Button>
        </HeaderActions>
      )}
      <FilterBar>
        <Field label={t("ui.costDate")}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("ui.costFarm")}>
          <Select value={farmId} onChange={(e) => setFarmId(e.target.value)} options={[{ value: "", label: t("ui.costNone") }, ...(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))]} />
        </Field>
      </FilterBar>
      <DataTable columns={sheet} rows={list} rowKey={(e) => e.id} caption={t("ui.staffAttendance")} />
      {save.error ? <ErrorBox error={save.error} /> : null}
      {past.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHead title={t("ui.attRecent")} />
          <ExportableTable name="asistencia">
            <DataTable columns={history} rows={past} rowKey={(a) => a.id} />
          </ExportableTable>
        </section>
      )}
    </div>
  );
}

interface Balance {
  employeeId: string;
  name: string;
  days: number;
  accruedPyg: number;
  advancesPyg: number;
  paymentsPyg: number;
  balancePyg: number;
}
interface Line {
  id: string;
  date: string;
  kind: "wage" | "advance" | "payment";
  amountPyg: number;
  balancePyg: number;
  note: string | null;
}

/** Saldo por empleado (devengado - adelantos - pagos), con su cuenta corriente y el alta de adelantos y pagos. */
function BalancesTab({ onGoEmployees }: { onGoEmployees: () => void }) {
  const q = useQuery({ queryKey: ["erp", "employee-balance"], queryFn: () => get<Balance[]>("/org/erp/employees/balance") });
  const [paying, setPaying] = useState<Balance | null>(null);
  const [viewing, setViewing] = useState<Balance | null>(null);
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <NoStaff onGo={onGoEmployees} />;
  const cols: Column<Balance>[] = [
    { id: "name", header: t("ui.staffName"), cell: (r) => r.name },
    { id: "days", header: t("ui.balDays"), align: "right", hideBelow: "md", cell: (r) => r.days },
    { id: "accrued", header: t("ui.balAccrued"), align: "right", hideBelow: "sm", cell: (r) => fmtGs(r.accruedPyg) },
    { id: "advances", header: t("ui.balAdvances"), align: "right", hideBelow: "lg", cell: (r) => fmtGs(r.advancesPyg) },
    { id: "payments", header: t("ui.balPayments"), align: "right", hideBelow: "lg", cell: (r) => fmtGs(r.paymentsPyg) },
    { id: "balance", header: t("ui.balBalance"), align: "right", cell: (r) => <span className={`font-medium ${r.balancePyg < 0 ? "text-peligro" : ""}`}>{fmtGs(r.balancePyg)}</span> },
    {
      id: "_actions",
      header: <span className="sr-only">{t("ui.rowActionsHeader")}</span>,
      align: "right",
      cell: (r) => (
        <span className="inline-flex gap-1 whitespace-nowrap">
          <Button variant="quiet" size="sm" onClick={() => setPaying(r)}>
            {t("ui.balPay")}
          </Button>
          <Button variant="quiet" size="sm" onClick={() => setViewing(r)}>
            {t("ui.balStatement")}
          </Button>
        </span>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PayrollExport />
      <DataTable columns={cols} rows={rows} rowKey={(r) => r.employeeId} caption={t("ui.staffBalances")} />
      <p className="text-meta text-tinta-2">{t("ui.balIntro")}</p>
      {paying && <PayModal row={paying} onClose={() => setPaying(null)} />}
      {viewing && <StatementModal row={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function PayModal({ row, onClose }: { row: Balance; onClose: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState("advance");
  const [date, setDate] = useState(localDate(Date.now()));
  const [amount, setAmount] = useState(row.balancePyg > 0 ? String(row.balancePyg) : "");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () => post("/org/erp/employee-payments", { employeeId: row.employeeId, kind, date, amountPyg: Number(amount), note: note || null }),
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  return (
    <Modal title={`${t("ui.balPay")}: ${row.name}`} onClose={onClose}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.costCategory")}>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} options={EMPLOYEE_PAYMENT_KINDS.map((k) => ({ value: k, label: tk(`ui.balKind_${k}`) }))} />
        </Field>
        <Field label={t("ui.costDate")}>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("ui.balAmount")}>
          <Input required type="number" min={1} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("ui.balNote")}>
          <Input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <FormFooter error={save.error} disabled={save.isPending} />
      </form>
    </Modal>
  );
}

function StatementModal({ row, onClose }: { row: Balance; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["erp", "employee-statement", row.employeeId], queryFn: () => get<Line[]>(`/org/erp/employees/${row.employeeId}/statement`) });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/erp/employee-payments/${id}`),
    onSuccess: () => {
      toast(t("ui.erpDeleted"));
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  return (
    <Modal title={`${t("ui.balStatement")}: ${row.name}`} onClose={onClose}>
      {q.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={[
            { id: "date", header: t("ui.costDate"), cell: (l: Line) => fmtIsoDate(l.date) },
            {
              id: "kind",
              header: t("ui.costCategory"),
              cell: (l: Line) => (
                <>
                  {tk(`ui.balKind_${l.kind}`)}
                  {l.note ? <span className="text-tinta-2">: {l.note}</span> : null}
                </>
              ),
            },
            { id: "amount", header: t("ui.balAmount"), align: "right", cell: (l: Line) => <span className={l.amountPyg < 0 ? "text-tinta-2" : ""}>{fmtGs(l.amountPyg)}</span> },
            { id: "balance", header: t("ui.balBalance"), align: "right", cell: (l: Line) => <span className="font-medium">{fmtGs(l.balancePyg)}</span> },
            { id: "_actions", header: <span className="sr-only">{t("ui.rowActionsHeader")}</span>, align: "right", width: "3rem", cell: (l: Line) => (l.kind !== "wage" ? <RowMenu name={fmtIsoDate(l.date)} onDelete={() => remove.mutate(l.id)} /> : null) },
          ]}
          rows={q.data ?? []}
          rowKey={(l) => l.id}
          empty={<EmptyState compact title={t("ui.erpEmpty")} />}
        />
      )}
    </Modal>
  );
}

const monthStart = (back: number) => {
  const d = new Date(Date.now() - 3 * 3_600_000);
  return localDate(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1));
};

/** Planilla para el contador (E-27): Excel con jornales, adelantos y pagos por empleado y mes. Sin aportes. */
function PayrollExport() {
  const [from, setFrom] = useState(monthStart(2));
  const [to, setTo] = useState(localDate(Date.now()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [empty, setEmpty] = useState(false);
  const download = async () => {
    setBusy(true);
    setError(null);
    setEmpty(false);
    try {
      const rows = await get<PayrollRow[]>(`/org/erp/employees/payroll${qs({ from, to })}`);
      if (rows.length === 0) return setEmpty(true);
      const headers = [t("ui.payMonth"), t("ui.staffName"), t("ui.staffCi"), t("ui.balDays"), t("ui.balAccrued"), t("ui.balAdvances"), t("ui.balPayments"), t("ui.payMonthBalance")];
      const line = (r: PayrollRow) => [r.month, r.name, r.ci ?? "", r.days, r.accruedPyg, r.advancesPyg, r.paymentsPyg, r.balancePyg];
      const totals = new Map<string, PayrollRow>();
      for (const r of rows) {
        const x = totals.get(r.employeeId) ?? { ...r, month: "", days: 0, accruedPyg: 0, advancesPyg: 0, paymentsPyg: 0, balancePyg: 0 };
        x.days += r.days;
        x.accruedPyg += r.accruedPyg;
        x.advancesPyg += r.advancesPyg;
        x.paymentsPyg += r.paymentsPyg;
        x.balancePyg += r.balancePyg;
        totals.set(r.employeeId, x);
      }
      const sum = (k: "days" | "accruedPyg" | "advancesPyg" | "paymentsPyg" | "balancePyg") => rows.reduce((a, r) => a + r[k], 0);
      await tablesToExcel(`planilla-${from.slice(0, 7)}_${to.slice(0, 7)}`, [
        {
          name: t("ui.paySheetMonthly"),
          headers,
          rows: [...rows.map(line), [], [t("ui.payTotal"), "", "", sum("days"), sum("accruedPyg"), sum("advancesPyg"), sum("paymentsPyg"), sum("balancePyg")], [], [t("ui.payNoContributions")]],
        },
        {
          name: t("ui.paySheetByEmployee"),
          headers: headers.slice(1),
          rows: [...totals.values()].sort((a, b) => a.name.localeCompare(b.name, "es")).map((r) => line(r).slice(1)),
        },
      ]);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <FilterBar>
        <Field label={t("ui.acctFrom")}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t("ui.acctTo")}>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button onClick={download} disabled={busy || !from || !to}>
          {t("ui.payExport")}
        </Button>
      </FilterBar>
      <p className="text-meta text-tinta-2">{t("ui.payExportHint")}</p>
      {empty && <p className="text-sm">{t("ui.payEmpty")}</p>}
      {error ? <ErrorBox error={error} /> : null}
    </div>
  );
}
