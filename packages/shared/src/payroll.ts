/**
 * Planilla simple para el contador (E-27): jornales devengados, adelantos y pagos por empleado y mes.
 * No calcula aportes ni descuentos (IPS, retenciones): eso lo hace el contador. Pura: el Worker agrupa y esto arma las filas.
 */
export interface PayrollEmployee {
  id: string;
  name: string;
  ci: string | null;
}
export interface PayrollAccrual {
  employeeId: string;
  /** "AAAA-MM". */
  month: string;
  days: number;
  wagePyg: number;
}
export interface PayrollPayment {
  employeeId: string;
  month: string;
  kind: "advance" | "payment";
  amountPyg: number;
}
export interface PayrollRow {
  month: string;
  employeeId: string;
  name: string;
  ci: string | null;
  days: number;
  accruedPyg: number;
  advancesPyg: number;
  paymentsPyg: number;
  /** Devengado menos adelantos y pagos del mes (negativo: se pagó más de lo devengado). */
  balancePyg: number;
}

/** "AAAA-MM" de las fechas "AAAA-MM-DD" desde y hasta, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const [ty, tm] = [Number(to.slice(0, 4)), Number(to.slice(5, 7))];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) [y, m] = [y + 1, 1];
  }
  return out;
}

/** Una fila por empleado y mes con movimientos, ordenadas por mes y nombre. Los empleados borrados con movimientos quedan fuera. */
export function buildPayroll(employees: PayrollEmployee[], accruals: PayrollAccrual[], payments: PayrollPayment[]): PayrollRow[] {
  const byEmp = new Map(employees.map((e) => [e.id, e]));
  const rows = new Map<string, PayrollRow>();
  const row = (employeeId: string, month: string): PayrollRow | null => {
    const e = byEmp.get(employeeId);
    if (!e) return null;
    const key = `${month}|${employeeId}`;
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { month, employeeId, name: e.name, ci: e.ci, days: 0, accruedPyg: 0, advancesPyg: 0, paymentsPyg: 0, balancePyg: 0 }));
    return r;
  };
  for (const a of accruals) {
    const r = row(a.employeeId, a.month);
    if (r) {
      r.days += a.days;
      r.accruedPyg += a.wagePyg;
    }
  }
  for (const p of payments) {
    const r = row(p.employeeId, p.month);
    if (!r) continue;
    if (p.kind === "advance") r.advancesPyg += p.amountPyg;
    else r.paymentsPyg += p.amountPyg;
  }
  for (const r of rows.values()) r.balancePyg = r.accruedPyg - r.advancesPyg - r.paymentsPyg;
  return [...rows.values()].sort((a, b) => a.month.localeCompare(b.month) || a.name.localeCompare(b.name, "es"));
}
