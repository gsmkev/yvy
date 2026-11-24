/** Tipos de las respuestas del inventario. */
import { type Currency } from "@yvy/shared";

/** Existencias por producto y depósito y totales por producto. */
export interface Summary {
  rows: { productId: string; warehouseId: string; qty: number; valuePyg?: number }[];
  products: { productId: string; qty: number; valuePyg?: number; avgCostPyg?: number }[];
}

/** Movimiento de stock con su origen, cantidad y valor. */
export interface StockMove {
  id: string;
  productId: string;
  warehouseId: string;
  qty: number;
  valuePyg?: number;
  amount?: number | null;
  currency?: Currency | null;
  occurredAt: number;
  origin: "purchase" | "consumption" | "transfer" | "adjustment";
  originId: string | null;
  note: string | null;
  photoPath?: string | null;
}

/** Tipo de movimiento que se carga a mano. */
export type Mode = "purchase" | "consumption" | "transfer" | "adjustment";

/** Lote de un producto próximo a vencer. */
export interface ExpiringLot {
  productId: string;
  lot: string | null;
  expiresOn: string;
  daysLeft: number;
  remaining: number;
}


/** Fecha ISO (aaaa-mm-dd) de un instante en UTC. */
export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
