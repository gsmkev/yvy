/** Hojas del Excel para el contador: libro de movimientos, cuentas a pagar y a cobrar y plan de cuentas. */
import type { CostCategory } from "@yvy/shared";
import { t, tk } from "../../../lib/i18n";
import type { TableData } from "../../../lib/tableExport";

export interface MapRow {
  key: CostCategory;
  code: string;
  name: string;
  custom: boolean;
}
export interface Ledger {
  date: string;
  type: "income" | "cost";
  accountCode: string;
  accountName: string;
  description: string;
  party: string;
  ruc: string;
  farm: string;
  activity: string;
  currency: string;
  amount: number;
  amountPyg: number;
  origin: string;
}
export interface Due {
  label: string;
  party: string;
  ruc: string;
  currency: string;
  total: number;
  pending: number;
  dueDate: string | null;
}
export interface Export {
  truncated: boolean;
  ledger: Ledger[];
  payables: Due[];
  receivables: Due[];
}

/** Monto en unidad menor a lo que se lee en una planilla: guaraníes enteros, dólares con dos decimales. */
const major = (minor: number, currency: string) => (currency === "USD" ? minor / 100 : minor);

const dueTable = (name: string, rows: Due[]): TableData => ({
  name,
  headers: [t("ui.acct.colParty"), t("ui.acct.colRuc"), t("ui.acct.colDoc"), t("ui.acct.colCurrency"), t("ui.acct.colTotal"), t("ui.acct.colPending"), t("ui.acct.colDue")],
  rows: rows.map((r) => [r.party, r.ruc, r.label, r.currency, major(r.total, r.currency), major(r.pending, r.currency), r.dueDate ?? ""]),
});

const ledgerHeaders = () => [
  t("ui.cost.date"),
  t("ui.acct.colType"),
  t("ui.acct.colCode"),
  t("ui.acct.colAccount"),
  t("ui.acct.colDescription"),
  t("ui.acct.colParty"),
  t("ui.acct.colRuc"),
  t("ui.cost.farm"),
  t("ui.cost.activity"),
  t("ui.acct.colCurrency"),
  t("ui.acct.colAmount"),
  t("ui.acct.colAmountPyg"),
];

const ledgerRow = (r: Ledger) => [r.date, t(r.type === "income" ? "ui.acct.income" : "ui.acct.cost"), r.accountCode, r.accountName, r.description, r.party, r.ruc, r.farm, tk(`ui.activity.${r.activity}`), r.currency, major(r.amount, r.currency), r.amountPyg];

/** Las cuatro hojas del libro a partir de lo exportado y del plan de cuentas. */
export function accountantSheets(d: Export, map: MapRow[]): TableData[] {
  return [
    { name: t("ui.acct.sheetLedger"), headers: ledgerHeaders(), rows: d.ledger.map(ledgerRow) },
    dueTable(t("ui.acct.sheetPayables"), d.payables),
    dueTable(t("ui.acct.sheetReceivables"), d.receivables),
    { name: t("ui.acct.sheetMap"), headers: [t("ui.cost.category"), t("ui.acct.colCode"), t("ui.acct.colAccount")], rows: map.map((m) => [tk(`ui.cost.category_${m.key}`), m.code, m.name]) },
  ];
}
