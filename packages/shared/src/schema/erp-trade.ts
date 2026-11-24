/** Tablas del ERP de raciones, compras, venta de granos, hacienda y caja; son de oficina y no se sincronizan. */

import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { ACTIVITIES, CASH_ACCOUNT_TYPES, CATTLE_DEAL_KINDS, COST_CATEGORIES, CURRENCIES } from "../erp";
import { timestamps } from "./columns";

/** Raciones de alimentación guardadas por la organización, con sus ingredientes en JSON. */
export const feedRations = sqliteTable(
  "feed_rations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    items: text("items").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("feed_rations_org_idx").on(t.organizationId, t.name)],
);

/** Presupuesto de campaña: una línea por lote, cultivo o toda la campaña, con actividad y rubro. */
export const budgetLines = sqliteTable(
  "budget_lines",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    seasonId: text("season_id").notNull(),
    /** Alcance: un lote, un cultivo, o ninguno de los dos (toda la campaña). */
    plotId: text("plot_id"),
    crop: text("crop"),
    activity: text("activity", { enum: ACTIVITIES }),
    category: text("category", { enum: COST_CATEGORIES }).notNull(),
    /** Monto presupuestado en guaraníes. */
    amountPyg: integer("amount_pyg").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("budget_lines_season_idx").on(t.organizationId, t.seasonId)],
);

/** Compra a un proveedor: orden, factura y recepción en depósito. */
export const purchases = sqliteTable(
  "purchases",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    partyId: text("party_id"),
    farmId: text("farm_id"),
    /** "YYYY-MM-DD". */
    orderDate: text("order_date").notNull(),
    expectedDate: text("expected_date"),
    currency: text("currency", { enum: CURRENCIES }).notNull(),
    /** Total en unidad menor de `currency` (se recalcula al recibir con las cantidades recibidas). */
    totalAmount: integer("total_amount").notNull().default(0),
    /** Total en guaraníes con el tipo de cambio de la factura (o de la orden si todavía no hay factura). */
    totalPyg: integer("total_pyg").notNull().default(0),
    invoiceNumber: text("invoice_number"),
    invoiceDate: text("invoice_date"),
    /** Vencimiento de la factura: de acá salen las cuentas a pagar. */
    dueDate: text("due_date"),
    /** Lo ya pagado, en unidad menor de `currency`. */
    paidAmount: integer("paid_amount").notNull().default(0),
    warehouseId: text("warehouse_id"),
    receivedAt: text("received_at"),
    note: text("note"),
    /** Foto de la factura en R2. */
    photoPath: text("photo_path"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [index("purchases_org_idx").on(t.organizationId, t.orderDate), index("purchases_due_idx").on(t.organizationId, t.dueDate)],
);

/** Líneas de una compra: producto con stock o gasto con rubro. */
export const purchaseLines = sqliteTable(
  "purchase_lines",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    purchaseId: text("purchase_id").notNull(),
    /** Producto del catálogo (entra al stock) o, sin producto, un gasto con su rubro (entra como costo). */
    productId: text("product_id"),
    description: text("description"),
    category: text("category", { enum: COST_CATEGORIES }),
    activity: text("activity", { enum: ACTIVITIES }),
    qty: real("qty").notNull(),
    /** Cantidad realmente recibida (por defecto, la pedida). */
    receivedQty: real("received_qty"),
    unitPrice: integer("unit_price").notNull(),
    lot: text("lot"),
    expiresOn: text("expires_on"),
    ...timestamps,
  },
  (t) => [index("purchase_lines_purchase_idx").on(t.organizationId, t.purchaseId)],
);

/** Contrato de venta de granos a un comprador. */
export const grainContracts = sqliteTable(
  "grain_contracts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    partyId: text("party_id"),
    number: text("number"),
    crop: text("crop").notNull(),
    seasonId: text("season_id"),
    /** Toneladas contratadas. */
    tons: real("tons").notNull(),
    /** Precio por tonelada en unidad menor de `currency`. */
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency", { enum: CURRENCIES }).notNull(),
    deliveryFrom: text("delivery_from"),
    deliveryTo: text("delivery_to"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("grain_contracts_org_idx").on(t.organizationId, t.crop)],
);

/** Liquidación de un contrato: toneladas, precio, descuentos y neto. Es un ingreso y una cuenta a cobrar. */
export const grainSettlements = sqliteTable(
  "grain_settlements",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    contractId: text("contract_id").notNull(),
    number: text("number"),
    date: text("date").notNull(),
    tons: real("tons").notNull(),
    priceMinor: integer("price_minor").notNull(),
    deductionsMinor: integer("deductions_minor").notNull().default(0),
    /** Neto cobrable en unidad menor de `currency` y en guaraníes. */
    netAmount: integer("net_amount").notNull(),
    netPyg: integer("net_pyg").notNull(),
    currency: text("currency", { enum: CURRENCIES }).notNull(),
    farmId: text("farm_id"),
    plotId: text("plot_id"),
    seasonId: text("season_id"),
    dueDate: text("due_date"),
    /** Lo ya cobrado, en unidad menor de `currency`. */
    paidAmount: integer("paid_amount").notNull().default(0),
    photoPath: text("photo_path"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [index("grain_settlements_contract_idx").on(t.organizationId, t.contractId), index("grain_settlements_due_idx").on(t.organizationId, t.dueDate)],
);

/** Compra o venta de hacienda: cabezas, kilos, precio y guía de traslado. */
export const cattleDeals = sqliteTable(
  "cattle_deals",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    kind: text("kind", { enum: CATTLE_DEAL_KINDS }).notNull(),
    date: text("date").notNull(),
    partyId: text("party_id"),
    farmId: text("farm_id"),
    seasonId: text("season_id"),
    /** Categoría (vaca, novillo, ternero...): texto libre. */
    category: text("category"),
    heads: integer("heads").notNull(),
    /** Kilos vivos totales. */
    totalKg: real("total_kg").notNull(),
    /** Importe total en unidad menor de `currency` y en guaraníes. */
    amount: integer("amount").notNull(),
    currency: text("currency", { enum: CURRENCIES }).notNull(),
    amountPyg: integer("amount_pyg").notNull(),
    /** Número de la guía de traslado (SENACSA). */
    guideNumber: text("guide_number"),
    dueDate: text("due_date"),
    /** Lo ya pagado o cobrado, en unidad menor de `currency`. */
    paidAmount: integer("paid_amount").notNull().default(0),
    photoPath: text("photo_path"),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [index("cattle_deals_org_idx").on(t.organizationId, t.date), index("cattle_deals_due_idx").on(t.organizationId, t.dueDate)],
);

/** Caja o cuenta bancaria en una moneda. */
export const cashAccounts = sqliteTable(
  "cash_accounts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: CASH_ACCOUNT_TYPES }).notNull(),
    currency: text("currency", { enum: CURRENCIES }).notNull(),
    /** Saldo inicial en unidad menor de `currency`. */
    openingBalance: integer("opening_balance").notNull().default(0),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("cash_accounts_org_idx").on(t.organizationId)],
);

/** Movimiento de una cuenta: entra con signo positivo, sale con negativo, en la moneda de la cuenta. */
export const cashMoves = sqliteTable(
  "cash_moves",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    accountId: text("account_id").notNull(),
    date: text("date").notNull(),
    amount: integer("amount").notNull(),
    description: text("description"),
    partyId: text("party_id"),
    /** Documento que se pagó o cobró: "purchase", "settlement" o "cattle"; "transfer" entre cuentas; o null (manual). */
    docKind: text("doc_kind"),
    docId: text("doc_id"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [index("cash_moves_account_idx").on(t.organizationId, t.accountId, t.date), index("cash_moves_doc_idx").on(t.docId)],
);

/**
 * Datos de IVA de un documento: timbrado y desglose en gravadas 10 %, gravadas 5 % y exentas (guaraníes, con el
 * IVA incluido). Una fila por documento de compra o venta; sin fila, el desglose no está cargado.
 */
export const documentTaxes = sqliteTable(
  "document_taxes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    /** "purchase", "settlement" o "cattle", como en cash_moves.doc_kind. */
    docKind: text("doc_kind").notNull(),
    docId: text("doc_id").notNull(),
    timbrado: text("timbrado"),
    gross10: integer("gross_10").notNull().default(0),
    gross5: integer("gross_5").notNull().default(0),
    exempt: integer("exempt").notNull().default(0),
    updatedBy: text("updated_by").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("document_taxes_doc_uq").on(t.organizationId, t.docKind, t.docId)],
);

/** Formato de exportación guardado: conjunto de datos, columnas, separador y formatos de fecha y de números. */
export const exportFormats = sqliteTable(
  "export_formats",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    dataset: text("dataset").notNull(),
    /** JSON con ExportConfig (packages/shared/src/export-format.ts). */
    config: text("config").notNull(),
    ...timestamps,
  },
  (t) => [index("export_formats_org_idx").on(t.organizationId, t.dataset)],
);

/** Plan de cuentas del contador: a qué cuenta va cada rubro al exportar. Sin fila, rige el plan de ejemplo. */
export const accountMap = sqliteTable(
  "account_map",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    /** Rubro de costo (input, fuel...) o "sale" para ingresos. */
    key: text("key").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    updatedBy: text("updated_by").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("account_map_key_uq").on(t.organizationId, t.key)],
);

/**
 * Segundo factor TOTP (RFC 6238) por usuario. El secreto va cifrado (AES-GCM, clave derivada de JWT_SECRET);
 * `enabledAt` null = alta sin confirmar. `lastStep` evita reusar un código ya aceptado. No se sincroniza.
 */
