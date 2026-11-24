import { z } from "zod";
import { uuid } from "./internal";
import { PARTY_KINDS, isoDate, optText, minorAmount } from "./core";

// ---------- Terceros (E-02) ----------

/** RUC (con dígito verificador) o cédula: solo dígitos y un guion final opcional. */
const ruc = z
  .string()
  .trim()
  .regex(/^\d{3,9}(-\d)?$/, "RUC o cédula inválidos (ej. 80012345-6)");

export const partyInput = z.object({
  name: z.string().trim().min(1).max(120),
  ruc: ruc.nullish(),
  kind: z.enum(PARTY_KINDS),
  phone: optText(40),
  email: optText(120),
  address: optText(200),
  note: optText(500),
});

// ---------- Personal y asistencia (E-25) ----------

export const employeeInput = z.object({
  name: z.string().trim().min(1).max(120),
  ci: optText(30),
  phone: optText(40),
  dailyWagePyg: minorAmount,
  userId: z.string().min(1).max(64).nullish(),
  note: optText(300),
});

export const ATTENDANCE_DAYS = [1, 0.5] as const;
export const maxAttendanceEntriesPerCall = 30;

export const attendanceEntry = z.object({
  employeeId: uuid,
  /** Día completo o medio día. */
  days: z.union([z.literal(1), z.literal(0.5)]),
  farmId: uuid.nullish(),
  plotId: uuid.nullish(),
  seasonId: uuid.nullish(),
  labor: optText(120),
  /** Jornal del día si no es el vigente del empleado. */
  wagePyg: minorAmount.nullish(),
});
export const attendanceDayInput = z.object({
  date: isoDate,
  entries: z.array(attendanceEntry).min(1).max(maxAttendanceEntriesPerCall),
});

/** Jornal por los días trabajados, en guaraníes enteros. */
export const wageFor = (dailyWagePyg: number, days: number): number => Math.round(dailyWagePyg * days);

// ---------- Adelantos, pagos y saldo por empleado (E-26) ----------

export const EMPLOYEE_PAYMENT_KINDS = ["advance", "payment"] as const;
export type EmployeePaymentKind = (typeof EMPLOYEE_PAYMENT_KINDS)[number];

export const employeePaymentInput = z.object({
  employeeId: uuid,
  date: isoDate,
  kind: z.enum(EMPLOYEE_PAYMENT_KINDS),
  amountPyg: minorAmount.refine((n) => n > 0, "El monto tiene que ser mayor que cero"),
  note: optText(200),
});

/** Saldo = devengado - adelantos - pagos. Positivo: se le debe al empleado; negativo: tiene adelantos de más. */
export const employeeBalance = (accruedPyg: number, advancesPyg: number, paymentsPyg: number): number =>
  accruedPyg - advancesPyg - paymentsPyg;

export interface StatementLine {
  date: string;
  kind: "wage" | EmployeePaymentKind;
  /** Con signo: el jornal suma, los adelantos y pagos restan. */
  amountPyg: number;
  note: string | null;
  id: string;
}

/** Cuenta corriente: líneas por fecha (a igual fecha, primero el jornal) con el saldo acumulado. */
export function statement(lines: StatementLine[]): (StatementLine & { balancePyg: number })[] {
  const order = (l: StatementLine) => (l.kind === "wage" ? 0 : 1);
  let bal = 0;
  return [...lines]
    .sort((a, b) => a.date.localeCompare(b.date) || order(a) - order(b) || a.id.localeCompare(b.id))
    .map((l) => ({ ...l, balancePyg: (bal += l.amountPyg) }));
}
