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
import { Button, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, Tabs, toast } from "../ui";
import { MasterPanel, useErpList, type FieldDef } from "./MasterPanel";

export interface Employee {
  id: string;
  name: string;
  ci: string | null;
  phone: string | null;
  dailyWagePyg: number;
}
export const useEmployees = () => useErpList<Employee>("employees");

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
  const [tab, setTab] = useState<string>("attendance");
  const tabs = [
    { id: "attendance", label: t("ui.staffAttendance") },
    { id: "balances", label: t("ui.staffBalances") },
    { id: "employees", label: t("ui.staffEmployees") },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Tabs<string> tabs={tabs} value={tab} onChange={setTab} />
      {tab === "attendance" && <AttendanceSheet />}
      {tab === "employees" && <EmployeesList />}
      {tab === "balances" && <BalancesTab />}
    </div>
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
    <MasterPanel<Employee>
      path="employees"
      intro={t("ui.staffIntro")}
      newLabel={t("ui.staffNew")}
      name={(e) => e.name}
      fields={fields}
      columns={[
        { header: t("ui.staffName"), cell: (e) => <span className="font-medium">{e.name}</span> },
        { header: t("ui.staffCi"), cell: (e) => e.ci ?? "" },
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
function AttendanceSheet() {
  const staff = useEmployees();
  const farms = useFarms();
  const [date, setDate] = useState(localDate(Date.now()));
  const [farmId, setFarmId] = useState("");
  const farm = useFarm(farmId, !!farmId);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const qc = useQueryClient();
  const day = useQuery({ queryKey: ["erp", "attendance", date], queryFn: () => get<Attendance[]>(`/org/erp/attendance${qs({ from: date, to: date })}`) });
  const recent = useQuery({ queryKey: ["erp", "attendance", "recent"], queryFn: () => get<Attendance[]>("/org/erp/attendance") });
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
  if (staff.isLoading) return <Spinner />;
  if (staff.error) return <ErrorBox error={staff.error} />;
  const list = staff.data ?? [];
  const name = (id: string) => list.find((e) => e.id === id)?.name ?? "?";
  const loaded = new Map<string, number>();
  for (const a of day.data ?? []) loaded.set(a.employeeId, (loaded.get(a.employeeId) ?? 0) + a.days);
  const set = (id: string, patch: Partial<Mark>) => setMarks({ ...marks, [id]: { days: "", plotId: "", labor: "", ...marks[id], ...patch } });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-tinta-2">{t("ui.attIntro")}</p>
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Field label={t("ui.costDate")}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("ui.costFarm")}>
          <Select value={farmId} onChange={(e) => setFarmId(e.target.value)} options={[{ value: "", label: t("ui.costNone") }, ...(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))]} />
        </Field>
      </div>
      {list.length === 0 ? (
        <Empty>{t("ui.attNoStaff")}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-tinta-2">
                <th className="py-2 pr-4 font-medium">{t("ui.staffName")}</th>
                <th className="py-2 pr-4 font-medium">{t("ui.attDays")}</th>
                <th className="py-2 pr-4 font-medium">{t("ui.costPlot")}</th>
                <th className="py-2 pr-4 font-medium">{t("ui.attLabor")}</th>
                <th className="py-2 text-right font-medium">{t("ui.attLoaded")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="border-b border-linea">
                  <td className="py-2 pr-4 font-medium">{e.name}</td>
                  <td className="py-2 pr-4">
                    <Select
                      value={marks[e.id]?.days ?? ""}
                      onChange={(ev) => set(e.id, { days: ev.target.value as Mark["days"] })}
                      options={[
                        { value: "", label: "—" },
                        { value: "1", label: t("ui.attFull") },
                        { value: "0.5", label: t("ui.attHalf") },
                      ]}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <Select
                      value={marks[e.id]?.plotId ?? ""}
                      onChange={(ev) => set(e.id, { plotId: ev.target.value })}
                      options={[{ value: "", label: t("ui.costNone") }, ...(farm.data?.plots ?? []).map((p) => ({ value: p.id, label: p.name }))]}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <Input maxLength={120} value={marks[e.id]?.labor ?? ""} onChange={(ev) => set(e.id, { labor: ev.target.value })} />
                  </td>
                  <td className="num py-2 text-right text-tinta-2">{loaded.get(e.id) ? `${loaded.get(e.id)} d` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {save.error ? <ErrorBox error={save.error} /> : null}
      <div>
        <Button variant="primary" disabled={save.isPending || !Object.values(marks).some((m) => m.days)} onClick={() => save.mutate()}>
          {t("ui.save")}
        </Button>
      </div>
      <h2 className="border-b border-linea pb-2 font-serif text-lg font-semibold">{t("ui.attRecent")}</h2>
      {(recent.data ?? []).length === 0 ? (
        <Empty>{t("ui.erpEmpty")}</Empty>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {(recent.data ?? []).slice(0, 40).map((a) => (
              <tr key={a.id} className="border-b border-linea">
                <td className="num py-2.5 pr-4">{fmtIsoDate(a.date)}</td>
                <td className="py-2.5 pr-4 font-medium">{name(a.employeeId)}</td>
                <td className="num py-2.5 pr-4 text-right">{a.days === 1 ? t("ui.attFull") : t("ui.attHalf")}</td>
                <td className="py-2.5 pr-4 text-tinta-2">{a.labor}</td>
                <td className="num py-2.5 pr-4 text-right">{fmtGs(a.wagePyg)}</td>
                <td className="py-2.5 text-right">
                  <button className="cursor-pointer text-tinta-2 underline-offset-4 hover:text-peligro hover:underline" onClick={() => remove.mutate(a.id)}>
                    {t("ui.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
function BalancesTab() {
  const q = useQuery({ queryKey: ["erp", "employee-balance"], queryFn: () => get<Balance[]>("/org/erp/employees/balance") });
  const [paying, setPaying] = useState<Balance | null>(null);
  const [viewing, setViewing] = useState<Balance | null>(null);
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const rows = q.data ?? [];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-tinta-2">{t("ui.balIntro")}</p>
      <PayrollExport />
      {rows.length === 0 ? (
        <Empty>{t("ui.attNoStaff")}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-tinta-2">
                <th className="py-2 pr-4 font-medium">{t("ui.staffName")}</th>
                <th className="py-2 pr-4 text-right font-medium">{t("ui.balDays")}</th>
                <th className="py-2 pr-4 text-right font-medium">{t("ui.balAccrued")}</th>
                <th className="py-2 pr-4 text-right font-medium">{t("ui.balAdvances")}</th>
                <th className="py-2 pr-4 text-right font-medium">{t("ui.balPayments")}</th>
                <th className="py-2 pr-4 text-right font-medium">{t("ui.balBalance")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId} className="border-b border-linea">
                  <td className="py-2.5 pr-4 font-medium">{r.name}</td>
                  <td className="num py-2.5 pr-4 text-right">{r.days}</td>
                  <td className="num py-2.5 pr-4 text-right">{fmtGs(r.accruedPyg)}</td>
                  <td className="num py-2.5 pr-4 text-right">{fmtGs(r.advancesPyg)}</td>
                  <td className="num py-2.5 pr-4 text-right">{fmtGs(r.paymentsPyg)}</td>
                  <td className={`num py-2.5 pr-4 text-right font-medium ${r.balancePyg < 0 ? "text-peligro" : ""}`}>{fmtGs(r.balancePyg)}</td>
                  <td className="py-2.5 text-right whitespace-nowrap text-tinta-2">
                    <button className="mr-4 cursor-pointer underline-offset-4 hover:text-surco hover:underline" onClick={() => setPaying(r)}>
                      {t("ui.balPay")}
                    </button>
                    <button className="cursor-pointer underline-offset-4 hover:text-surco hover:underline" onClick={() => setViewing(r)}>
                      {t("ui.balStatement")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
        {save.error ? (
          <div className="col-span-2">
            <ErrorBox error={save.error} />
          </div>
        ) : null}
        <div className="col-span-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {t("ui.save")}
          </Button>
        </div>
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
        <table className="w-full text-sm">
          <tbody>
            {(q.data ?? []).map((l) => (
              <tr key={l.id} className="border-b border-linea">
                <td className="num py-2 pr-3">{fmtIsoDate(l.date)}</td>
                <td className="py-2 pr-3">
                  {l.kind === "wage" ? t("ui.balKind_wage") : tk(`ui.balKind_${l.kind}`)}
                  {l.note ? <span className="text-tinta-2">: {l.note}</span> : null}
                </td>
                <td className={`num py-2 pr-3 text-right ${l.amountPyg < 0 ? "text-tinta-2" : ""}`}>{fmtGs(l.amountPyg)}</td>
                <td className="num py-2 pr-3 text-right font-medium">{fmtGs(l.balancePyg)}</td>
                <td className="py-2 text-right">
                  {l.kind !== "wage" && (
                    <button className="cursor-pointer text-tinta-2 underline-offset-4 hover:text-peligro hover:underline" onClick={() => remove.mutate(l.id)}>
                      {t("ui.delete")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    <div className="flex flex-col gap-2 border-y border-linea py-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("ui.acctFrom")}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t("ui.acctTo")}>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button onClick={download} disabled={busy || !from || !to}>
          {t("ui.payExport")}
        </Button>
      </div>
      <p className="text-xs text-tinta-2">{t("ui.payExportHint")}</p>
      {empty && <p className="text-sm">{t("ui.payEmpty")}</p>}
      {error ? <ErrorBox error={error} /> : null}
    </div>
  );
}
