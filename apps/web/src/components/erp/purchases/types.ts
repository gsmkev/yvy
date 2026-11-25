/** Tipos de las respuestas de compras. */
import type { Currency, PurchaseStatus } from "@yvy/shared";

/** Renglón de una compra: producto del catálogo o gasto suelto. */
export interface Line {
  id: string;
  productId: string | null;
  description: string | null;
  category: string | null;
  qty: number;
  receivedQty: number | null;
  unitPrice: number;
  lot: string | null;
  expiresOn: string | null;
}

/** Compra con su factura y recepción. */
export interface Purchase {
  id: string;
  partyId: string | null;
  orderDate: string;
  currency: Currency;
  totalAmount: number;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  receivedAt: string | null;
  photoPath: string | null;
  status: PurchaseStatus;
  lines?: Line[];
}
