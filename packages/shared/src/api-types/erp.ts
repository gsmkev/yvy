/** Tipos de respuesta de los endpoints del ERP: resultados, saldos, vencimientos, mantenimiento y entregas. */

import type { Currency, MAINTENANCE_KINDS } from "../erp";

/** Cifras de resultado (costo, ingreso, margen, por hectárea y por tonelada). */
export interface ResultsFigures {
  costPyg: number;
  incomePyg: number;
  marginPyg: number;
  areaHa: number;
  tons: number;
  costPerHa: number | null;
  incomePerHa: number | null;
  marginPerHa: number | null;
  costPerTon: number | null;
}

/** Resultados de la campaña en total y por lote, cultivo, actividad y campaña. */
export interface ResultsResponse {
  totals: ResultsFigures;
  byPlot: (ResultsFigures & { plotId: string | null; name: string | null; crop: string | null })[];
  byCrop: (ResultsFigures & { crop: string | null })[];
  byActivity: { activity: string; costPyg: number; incomePyg: number; marginPyg: number }[];
  bySeason: { seasonId: string | null; name: string | null; costPyg: number; incomePyg: number; marginPyg: number }[];
  beef: { kgSold: number; costPyg: number; incomePyg: number; costPerKgPyg: number | null };
}

/** Saldos de las cuentas de caja y totales por moneda. */
export interface BalancesResponse {
  accounts: { id: string }[];
  totals: Record<string, number>;
}

/** Totales pendientes y vencidos por moneda. */
export interface DuesTotalsResponse {
  totals: Record<string, { pending: number; overdue: number }>;
}

/** Producto bajo su mínimo y cantidad faltante. */
export interface LowStockApiRow {
  productId: string;
  warehouseId: string;
  missing: number;
}

/** Documento con saldo por pagar o cobrar. */
export interface DueRow {
  docKind: "purchase" | "settlement" | "cattle";
  docId: string;
  partyId: string | null;
  label: string;
  currency: Currency;
  total: number;
  pending: number;
  dueDate: string | null;
  status: "none" | "overdue" | "soon" | "ok";
  daysLeft: number | null;
}

/** Documentos con saldo y totales por moneda. */
export interface DuesResponse {
  rows: DueRow[];
  totals: Record<string, { pending: number; overdue: number }>;
}

/** Servicio de mantenimiento próximo o vencido. */
export interface MaintenanceDue {
  planId: string;
  machineId: string;
  machine: string;
  name: string;
  meterKind: "hours" | "km";
  meter: number;
  dueAt: number;
  remaining: number;
  status: "ok" | "soon" | "overdue";
}

/** Plan de mantenimiento con su estado. */
export interface MaintenancePlanRow {
  id: string;
  machineId: string;
  name: string;
  everyUnits: number;
  lastDoneMeter: number;
}

/** Servicio de mantenimiento registrado. */
export interface MaintenanceLogRow {
  id: string;
  machineId: string;
  planId: string | null;
  kind: (typeof MAINTENANCE_KINDS)[number];
  occurredAt: number;
  meterValue: number | null;
  description: string | null;
  amountPyg?: number | null;
}

/** Entrega de granos registrada. */
export interface GrainDeliveryRow {
  id: string;
  contractId: string;
  date: string;
  tons: number;
  ticket: string | null;
  moisturePct: number | null;
}
