import { type Currency } from "@yvy/shared";

export interface Summary {
  rows: { productId: string; warehouseId: string; qty: number; valuePyg?: number }[];
  products: { productId: string; qty: number; valuePyg?: number; avgCostPyg?: number }[];
}

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

export type Mode = "purchase" | "consumption" | "transfer" | "adjustment";

export interface ExpiringLot {
  productId: string;
  lot: string | null;
  expiresOn: string;
  daysLeft: number;
  remaining: number;
}


export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
