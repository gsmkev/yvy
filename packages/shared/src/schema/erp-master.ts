/**
 * Tablas maestras del ERP: terceros, maquinaria, contratistas, tipo de cambio, costos, depósitos y movimientos de
 * stock.
 */

import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ACTIVITIES, CONTRACTOR_SERVICES, COST_CATEGORIES, CURRENCIES, MACHINE_TYPES, METER_KINDS, PARTY_KINDS, RATE_UNITS, STOCK_ORIGINS, WAREHOUSE_TYPES } from "../erp";
import { timestamps, synced } from "./columns";

// ---------- ERP ----------
// Tablas de oficina: no se sincronizan al celular (salvo products y machines), así que no llevan `version`.

/** Proveedores y clientes. El RUC es texto: lleva guion y dígito verificador. */
export const parties = sqliteTable(
  "parties",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    ruc: text("ruc"),
    kind: text("kind", { enum: PARTY_KINDS }).notNull().default("supplier"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("parties_org_idx").on(t.organizationId, t.name)],
);

/** Maquinaria y vehículos. Baja al celular para elegir la máquina en una carga de combustible. */
export const machines = sqliteTable(
  "machines",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    /** Estancia donde está; vacío = de toda la organización. */
    farmId: text("farm_id"),
    name: text("name").notNull(),
    type: text("type", { enum: MACHINE_TYPES }).notNull(),
    brand: text("brand"),
    model: text("model"),
    year: integer("year"),
    /** Horas de motor (tractor, cosechadora) o kilómetros (camión, camioneta). */
    meterKind: text("meter_kind", { enum: METER_KINDS }).notNull().default("hours"),
    meterValue: real("meter_value").notNull().default(0),
    ...synced,
  },
  (t) => [index("machines_sync_idx").on(t.organizationId, t.version, t.id)],
);

/** Contratistas de servicios con su tarifa: una fila por contratista y servicio. Monto en unidad menor. */
export const contractors = sqliteTable(
  "contractors",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    /** Tercero (proveedor) asociado, para el RUC y las facturas. */
    partyId: text("party_id"),
    service: text("service", { enum: CONTRACTOR_SERVICES }).notNull(),
    rateUnit: text("rate_unit", { enum: RATE_UNITS }).notNull(),
    rateAmount: integer("rate_amount").notNull(),
    currency: text("currency", { enum: CURRENCIES }).notNull().default("PYG"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("contractors_org_idx").on(t.organizationId, t.name)],
);

/** Tipo de cambio diario: guaraníes por dólar. Carga manual; se usa el más reciente hasta la fecha del movimiento. */
export const exchangeRates = sqliteTable(
  "exchange_rates",
  {
    organizationId: text("organization_id").notNull(),
    /** "YYYY-MM-DD". */
    date: text("date").notNull(),
    usdToPyg: integer("usd_to_pyg").notNull(),
    updatedBy: text("updated_by"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.date] })],
);

/**
 * Todo costo y toda venta. Centro de costo = estancia, lote, campaña y actividad.
 * `amount` va en unidad menor de `currency` y `amountPyg` es su valor en guaraníes con el tipo de cambio del día.
 * La venta (`category = "sale"`) es un ingreso con monto positivo. Los costos que nacen de un registro de campo
 * (consumo de insumos, combustible, contratista) llevan `origin` y `originId` = id del registro.
 */
export const costEntries = sqliteTable(
  "cost_entries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    /** Epoch ms del día del gasto (mediodía en Asunción). */
    occurredAt: integer("occurred_at").notNull(),
    farmId: text("farm_id"),
    plotId: text("plot_id"),
    seasonId: text("season_id"),
    activity: text("activity", { enum: ACTIVITIES }).notNull(),
    category: text("category", { enum: COST_CATEGORIES }).notNull(),
    description: text("description"),
    amount: integer("amount").notNull(),
    currency: text("currency", { enum: CURRENCIES }).notNull().default("PYG"),
    amountPyg: integer("amount_pyg").notNull(),
    /** Toneladas vendidas (solo ventas): permite el precio por tonelada. */
    tons: real("tons"),
    productId: text("product_id"),
    partyId: text("party_id"),
    /** "manual", "consumption" (insumos de un registro), "fuel", "contractor" (orden de trabajo). */
    origin: text("origin").notNull().default("manual"),
    originId: text("origin_id"),
    /** Foto de la factura o el ticket en R2. */
    photoPath: text("photo_path"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [
    index("cost_entries_org_date_idx").on(t.organizationId, t.occurredAt),
    index("cost_entries_plot_idx").on(t.plotId),
    index("cost_entries_origin_idx").on(t.originId),
  ],
);

/** Depósitos de una estancia: galpón, tanque de combustible o silo. Uno por estancia es el predeterminado. */
export const warehouses = sqliteTable(
  "warehouses",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: WAREHOUSE_TYPES }).notNull().default("shed"),
    /** Donde se descuentan los consumos automáticos de los registros de campo. */
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    ...synced,
  },
  (t) => [index("warehouses_farm_idx").on(t.organizationId, t.farmId), index("warehouses_sync_idx").on(t.organizationId, t.version, t.id)],
);

/**
 * Movimientos de stock. El stock de un producto en un depósito es la suma de `qty`.
 * `qty` va con signo en la unidad del producto (l o kg); `valuePyg` tiene el mismo signo y es el valor en guaraníes:
 * entradas por su costo de compra, salidas al costo promedio ponderado del momento.
 * Una transferencia son dos filas (salida y entrada) con el mismo `originId`. Un consumo automático de un registro de
 * campo lleva `originId` = id del registro: se reemplaza o se revierte cuando el registro cambia o se borra.
 */
export const stockMoves = sqliteTable(
  "stock_moves",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    productId: text("product_id").notNull(),
    warehouseId: text("warehouse_id").notNull(),
    qty: real("qty").notNull(),
    valuePyg: integer("value_pyg").notNull(),
    /** Lote y vencimiento ("YYYY-MM-DD") de lo comprado: agroquímicos y vacunas. */
    lot: text("lot"),
    expiresOn: text("expires_on"),
    /** Total del comprobante en unidad menor de `currency` (solo compras). */
    amount: integer("amount"),
    currency: text("currency", { enum: CURRENCIES }),
    occurredAt: integer("occurred_at").notNull(),
    origin: text("origin", { enum: STOCK_ORIGINS }).notNull(),
    originId: text("origin_id"),
    partyId: text("party_id"),
    note: text("note"),
    /** Foto de la factura o el ticket en R2. */
    photoPath: text("photo_path"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [
    index("stock_moves_product_idx").on(t.organizationId, t.productId),
    index("stock_moves_warehouse_idx").on(t.warehouseId),
    index("stock_moves_origin_idx").on(t.originId),
  ],
);
