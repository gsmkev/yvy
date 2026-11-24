import { z } from "zod";
import { uuid } from "./internal";
import { type CostCategory, isoDate, optText, minorAmount, currencySchema } from "./core";
import { daysUntil } from "./stock";

// ---------- Caja y bancos, cuentas a pagar y a cobrar (E-36) ----------

export const CASH_ACCOUNT_TYPES = ["cash", "bank"] as const;
export const DOC_KINDS = ["purchase", "settlement", "cattle"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const cashAccountInput = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(CASH_ACCOUNT_TYPES),
  currency: currencySchema,
  /** Saldo inicial en unidad menor (puede ser negativo: un sobregiro). */
  openingBalance: z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000).nullish(),
  note: optText(200),
});

export const cashMoveInput = z.object({
  accountId: uuid,
  date: isoDate,
  /** Con signo: positivo entra, negativo sale. */
  amount: z.number().int().refine((n) => n !== 0, "El monto no puede ser cero").refine((n) => Math.abs(n) <= 1_000_000_000_000),
  description: optText(200),
  partyId: uuid.nullish(),
});

export const cashTransferInput = z.object({
  fromAccountId: uuid,
  toAccountId: uuid,
  date: isoDate,
  amount: minorAmount.refine((n) => n > 0, "El monto tiene que ser mayor que cero"),
  description: optText(200),
});

export const settleInput = z.object({
  docKind: z.enum(DOC_KINDS),
  docId: uuid,
  accountId: uuid,
  date: isoDate,
  /** Lo que se paga o cobra ahora, en la moneda del documento. */
  amount: minorAmount.refine((n) => n > 0, "El monto tiene que ser mayor que cero"),
  description: optText(200),
});

export type DueStatus = "none" | "overdue" | "soon" | "ok";
/** Estado de un vencimiento al día `today`: vencido, por vencer (dentro de `soonDays`) o en fecha. */
export function dueStatus(dueDate: string | null, today: string, soonDays = 7): { status: DueStatus; daysLeft: number | null } {
  if (!dueDate) return { status: "none", daysLeft: null };
  const daysLeft = daysUntil(today, dueDate);
  return { status: daysLeft < 0 ? "overdue" : daysLeft <= soonDays ? "soon" : "ok", daysLeft };
}

// ---------- Exportación al contador (E-38) ----------

export interface AccountRef {
  code: string;
  name: string;
}
/** Plan de ejemplo: el contador lo reemplaza con los códigos de su plan de cuentas. */
export const DEFAULT_ACCOUNT_MAP: Record<CostCategory, AccountRef> = {
  input: { code: "5.1.01", name: "Insumos" },
  fuel: { code: "5.1.02", name: "Combustibles y lubricantes" },
  contractor: { code: "5.1.03", name: "Servicios de terceros" },
  labor: { code: "5.2.01", name: "Sueldos y jornales" },
  machinery: { code: "5.3.01", name: "Maquinaria: mantenimiento y repuestos" },
  other: { code: "5.9.01", name: "Otros gastos" },
  sale: { code: "4.1.01", name: "Ventas" },
};

export const accountMapInput = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(80),
});

/** Cuenta de un rubro: la que cargó el contador o, si no hay, la del plan de ejemplo. */
export const accountFor = (key: CostCategory, custom: Record<string, AccountRef>): AccountRef => custom[key] ?? DEFAULT_ACCOUNT_MAP[key];
