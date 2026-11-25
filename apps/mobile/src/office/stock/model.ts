/** Datos y cálculos de la pantalla de Stock: existencias por producto y borrador del ajuste por recuento. */
import { t } from "@yvy/shared";
import { parseDecimal } from "../format";

/** Existencias por depósito y por producto, como las devuelve /org/erp/stock. */
export interface Summary {
  rows: { productId: string; warehouseId: string; qty: number; valuePyg?: number }[];
  products: { productId: string; qty: number; valuePyg?: number; avgCostPyg?: number }[];
}
/** Movimiento de stock. */
export interface Move {
  id: string;
  productId: string;
  warehouseId: string;
  qty: number;
  occurredAt: number;
  origin: "purchase" | "consumption" | "transfer" | "adjustment";
  note: string | null;
}
/** Lote próximo a vencer. */
export interface Lot {
  productId: string;
  lot: string | null;
  expiresOn: string;
  daysLeft: number;
  remaining: number;
}
/** Producto con su cantidad total y lo que hay en cada depósito. */
export interface StockRow {
  productId: string;
  qty: number;
  valuePyg: number | undefined;
  parts: { warehouseId: string; qty: number }[];
}
/** Campos del ajuste como texto. */
export interface Draft {
  productId: string;
  warehouseId: string;
  sign: "plus" | "minus";
  qty: string;
  date: string;
  note: string;
}

const nonZero = (qty: number) => Math.abs(qty) > 1e-9;

/** Filas de existencias: todos los depósitos juntos o, con uno elegido, solo ese. */
export function stockRowsOf(s: Summary | null, warehouseId: string): StockRow[] {
  if (!s) return [];
  if (!warehouseId) return s.products.filter((p) => nonZero(p.qty)).map((p) => ({ productId: p.productId, qty: p.qty, valuePyg: p.valuePyg, parts: s.rows.filter((r) => r.productId === p.productId && nonZero(r.qty)).map((r) => ({ warehouseId: r.warehouseId, qty: r.qty })) }));
  return s.rows.filter((r) => r.warehouseId === warehouseId && nonZero(r.qty)).map((r) => ({ productId: r.productId, qty: r.qty, valuePyg: r.valuePyg, parts: [{ warehouseId: r.warehouseId, qty: r.qty }] }));
}

/** Valor del ajuste (con signo) o el texto del error de los campos del borrador. */
export function adjustmentQty(d: Draft): { qty: number } | { error: string } {
  if (!d.productId) return { error: t("office.adm.needsProduct") };
  if (!d.warehouseId) return { error: t("ui.stock.noWarehouse") };
  const n = parseDecimal(d.qty);
  if (n === null || n <= 0) return { error: t("office.adm.badQty") };
  if (!d.date) return { error: t("office.adm.needsDate") };
  return { qty: d.sign === "plus" ? n : -n };
}
