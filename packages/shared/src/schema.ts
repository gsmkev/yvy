/**
 * Esquema Drizzle compartido (PRD §10, adaptado a SQLite según PRD-cloudflare §4.1).
 * Mismo esquema en D1 (Worker) y expo-sqlite (app).
 *
 * Convenciones:
 * - ids UUIDv7 generados en el cliente (text).
 * - Fechas epoch ms (integer); fechas de calendario como text "YYYY-MM-DD".
 * - JSON en text; arrays como tabla puente (ej. alert_plots).
 * - Geometrías GeoJSON en text + columnas bbox indexadas.
 * - Tablas sincronizables: organization_id, created_at, updated_at (servidor), deleted_at y
 *   `version`, contador monotónico asignado por el servidor dentro de la transacción (sync_seq).
 *   El pull pagina por (version, id): equivale al "updated_at + desempate por id" del PRD §11
 *   pero sin depender de relojes de distintos datacenters.
 */
import { ACTIVITIES, CONTRACTOR_SERVICES, COST_CATEGORIES, CURRENCIES, MACHINE_TYPES, METER_KINDS, PARTY_KINDS, RATE_UNITS, STOCK_ORIGINS, WAREHOUSE_TYPES } from "./erp";
import { HEALTH_REASONS } from "./livestock";
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// ---------- Enums ----------

export const ROLES = ["owner", "admin", "agronomist", "worker"] as const;
export type Role = (typeof ROLES)[number];
export const MEMBERSHIP_STATUS = ["active", "invited", "disabled"] as const;
export const PLOT_KINDS = ["crop", "pasture"] as const;
export const CROPS = ["soja", "maiz", "trigo", "arroz", "girasol", "chia", "otro"] as const;
export const SEASONS = ["zafra", "zafrina"] as const;
export const POI_KINDS = [
  "rain_gauge",
  "water",
  "house",
  "gate",
  "corral",
  "silo",
  "shed",
  "bridge",
  "mill",
  "trough",
  "chute",
  "dock",
  "other",
] as const;
/** Líneas del mapa (M-20): alambrados, caminos internos y cañerías. */
export const LINE_KINDS = ["fence", "road", "pipe"] as const;
export type LineKind = (typeof LINE_KINDS)[number];
export const RECURRENCES = ["none", "daily", "weekly"] as const;
export const TASK_STATUS = ["open", "done", "cancelled"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export const RECORD_KINDS = [
  "scouting",
  "pest",
  "crop_status",
  "pasture_status",
  "rain",
  "water",
  "note",
  // ganaderia
  "herd_count",
  "herd_move",
  "mortality",
  "health",
  // ADR 0004: registros agrícolas
  "sowing",
  "application",
  "fertilization",
  "harvest",
  // F-05: recorrida GPS grabada a pedido
  "track",
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
/** Tipos de producto del catálogo (ADR 0004). */
export const PRODUCT_TYPES = ["seed", "agrochemical", "fertilizer", "fuel", "veterinary", "other"] as const;
/** Unidad base del producto: litros o kilos. */
export const PRODUCT_UNITS = ["l", "kg"] as const;
export const UPLOAD_STATUS = ["pending", "uploaded"] as const;
export const ALERT_KINDS = ["frost", "excess_rain", "drought", "fire", "pest_threshold", "water_low"] as const;
export const ALERT_SEVERITIES = ["info", "watch", "warning"] as const;
/** Con MET Norway no hay ensemble: probabilidad cualitativa (PRD-cloudflare §4.8). */
export const ALERT_PROBABILITIES = ["low", "medium", "high"] as const;
/** P-03: pasos del embudo de activación. Los escribe el servidor, una sola vez por organización. */
export const FUNNEL_EVENTS = ["signup", "farm_created", "plots_created", "member_added", "first_record"] as const;
export const LAYERS = ["true_color", "ndvi"] as const;
/** Estado del procesamiento satelital inicial de una estancia (S-02). */
export const IMAGERY_STATUSES = ["pending", "processing", "ready", "failed"] as const;

// ---------- Columnas comunes ----------

const timestamps = {
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"),
};

const synced = {
  ...timestamps,
  version: integer("version").notNull().default(0),
};

const bbox = {
  minLon: real("min_lon").notNull(),
  minLat: real("min_lat").notNull(),
  maxLon: real("max_lon").notNull(),
  maxLat: real("max_lat").notNull(),
};

// ---------- Identidad y organización ----------

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country").notNull().default("PY"),
  plan: text("plan").notNull().default("trial"),
  trialEndsAt: integer("trial_ends_at"),
  /** P-10: topes propios de la organización; null = los del plan (LIMITS.plans). */
  maxHa: real("max_ha"),
  maxUsers: integer("max_users"),
  /** V-05: código de referido con el que se registró la organización (`?ref=`), tal cual llegó si tiene forma válida. */
  referredBy: text("referred_by"),
  /** V-05: agrónomo dueño del código, si se pudo identificar. */
  referrerUserId: text("referrer_user_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Equivale a `profiles` del PRD (no hay auth.users: la auth es propia). */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email"),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    locale: text("locale").notNull().default("es-PY"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    status: text("status", { enum: MEMBERSHIP_STATUS }).notNull().default("active"),
    /** Sube cada vez que cambian los lotes asignados: el cliente rehace sus tablas (PRD §11 reset). */
    assignmentsVersion: integer("assignments_version").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("memberships_org_user_uq").on(t.organizationId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const devices = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    platform: text("platform").notNull(),
    appVersion: text("app_version"),
    pushToken: text("push_token"),
    lastSyncAt: integer("last_sync_at"),
  },
  (t) => [index("devices_user_idx").on(t.userId)],
);

// ---------- Auth propia (PRD-cloudflare §4.2) ----------

export const emailCodes = sqliteTable(
  "email_codes",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    ip: text("ip"),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("email_codes_email_idx").on(t.email, t.createdAt), index("email_codes_ip_idx").on(t.ip, t.createdAt)],
);

/** QR de vinculación de un solo uso para empleados (reemplaza teléfono + PIN). */
export const linkCodes = sqliteTable(
  "link_codes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    userId: text("user_id").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("link_codes_hash_uq").on(t.codeHash)],
);

/**
 * PIN de ingreso de un empleado (F-24). Solo existe el hash (SHA-256 con sal propia y el secreto del servidor como
 * pimienta), nunca el PIN. `phoneKey` es el teléfono normalizado (ver pin.ts). Los intentos fallidos bloquean la cuenta.
 */
export const userPins = sqliteTable(
  "user_pins",
  {
    userId: text("user_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    phoneKey: text("phone_key").notNull(),
    salt: text("salt").notNull(),
    pinHash: text("pin_hash").notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: integer("locked_until"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("user_pins_phone_uq").on(t.phoneKey), index("user_pins_org_idx").on(t.organizationId)],
);

export const refreshTokens = sqliteTable(
  "refresh_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    deviceId: text("device_id"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    revokedAt: integer("revoked_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("refresh_tokens_hash_uq").on(t.tokenHash), index("refresh_tokens_user_idx").on(t.userId)],
);

// ---------- Campo ----------

/** Estancia. */
export const farms = sqliteTable(
  "farms",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    department: text("department"),
    district: text("district"),
    geometry: text("geometry").notNull(),
    ...bbox,
    centroidLon: real("centroid_lon").notNull(),
    centroidLat: real("centroid_lat").notNull(),
    areaHa: real("area_ha").notNull(),
    timezone: text("timezone").notNull().default("America/Asuncion"),
    offlinePackVersion: integer("offline_pack_version").notNull().default(0),
    ...synced,
  },
  (t) => [index("farms_sync_idx").on(t.organizationId, t.version, t.id)],
);

/** Lote o potrero. */
export const plots = sqliteTable(
  "plots",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: PLOT_KINDS }).notNull(),
    geometry: text("geometry").notNull(),
    ...bbox,
    areaHa: real("area_ha").notNull(),
    crop: text("crop", { enum: CROPS }),
    season: text("season", { enum: SEASONS }),
    sowingDate: text("sowing_date"),
    pastureType: text("pasture_type"),
    color: text("color"),
    ...synced,
  },
  (t) => [
    index("plots_sync_idx").on(t.organizationId, t.version, t.id),
    index("plots_farm_idx").on(t.farmId),
    index("plots_bbox_idx").on(t.organizationId, t.minLon, t.maxLon, t.minLat, t.maxLat),
  ],
);

export const pointsOfInterest = sqliteTable(
  "points_of_interest",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    kind: text("kind", { enum: POI_KINDS }).notNull(),
    name: text("name").notNull(),
    lon: real("lon").notNull(),
    lat: real("lat").notNull(),
    ...synced,
  },
  (t) => [index("poi_sync_idx").on(t.organizationId, t.version, t.id), index("poi_farm_idx").on(t.farmId)],
);

/**
 * Línea del mapa de una estancia (M-20): alambrado, camino interno o cañería, con su largo en metros.
 * Por ahora solo la web la usa; no está en el pull del sync (se suma cuando la app la necesite).
 */
export const farmLines = sqliteTable(
  "farm_lines",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    kind: text("kind", { enum: LINE_KINDS }).notNull(),
    name: text("name").notNull(),
    /** GeoJSON LineString. */
    geometry: text("geometry").notNull(),
    ...bbox,
    lengthM: real("length_m").notNull(),
    ...synced,
  },
  (t) => [
    index("farm_lines_sync_idx").on(t.organizationId, t.version, t.id),
    index("farm_lines_farm_idx").on(t.farmId),
  ],
);

export const plotAssignments = sqliteTable(
  "plot_assignments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    plotId: text("plot_id").notNull(),
    userId: text("user_id").notNull(),
    ...synced,
  },
  (t) => [
    uniqueIndex("plot_assignments_uq").on(t.userId, t.plotId),
    index("plot_assignments_sync_idx").on(t.organizationId, t.version, t.id),
  ],
);

// ---------- Campañas (ADR 0004) ----------

/** Campaña de la organización ("Zafra 2026/27"). Fechas de calendario "YYYY-MM-DD". */
export const seasons = sqliteTable(
  "seasons",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    startDate: text("start_date"),
    endDate: text("end_date"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...synced,
  },
  (t) => [index("seasons_sync_idx").on(t.organizationId, t.version, t.id)],
);

/** Qué se planifica o se sembró en un lote en una campaña. Una fila por (lote, campaña). */
export const plotSeasons = sqliteTable(
  "plot_seasons",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    plotId: text("plot_id").notNull(),
    seasonId: text("season_id").notNull(),
    crop: text("crop", { enum: CROPS }),
    variety: text("variety"),
    plannedSowingDate: text("planned_sowing_date"),
    /** Rinde objetivo en toneladas por hectárea. */
    targetYieldTHa: real("target_yield_t_ha"),
    ...synced,
  },
  (t) => [
    uniqueIndex("plot_seasons_plot_season_uq").on(t.plotId, t.seasonId),
    index("plot_seasons_sync_idx").on(t.organizationId, t.version, t.id),
    index("plot_seasons_season_idx").on(t.seasonId),
  ],
);

/** Catálogo de productos de la organización (insumos). Baja al celular para cargar aplicaciones sin señal. */
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: PRODUCT_TYPES }).notNull(),
    unit: text("unit", { enum: PRODUCT_UNITS }).notNull(),
    activeIngredient: text("active_ingredient"),
    /** Días de carencia antes de cosechar o de pastorear. */
    withdrawalDays: integer("withdrawal_days"),
    toxClass: text("tox_class"),
    ...synced,
  },
  (t) => [index("products_sync_idx").on(t.organizationId, t.version, t.id)],
);

// ---------- ERP (ADR 0004) ----------
// Tablas de oficina: no se sincronizan al celular (salvo products y machines), así que no llevan `version`.

/** Proveedores y clientes (E-02). El RUC es texto: lleva guion y dígito verificador. */
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

/** Maquinaria y vehículos (E-03). Baja al celular para elegir la máquina en una carga de combustible (E-16). */
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

/** Contratistas de servicios con su tarifa (E-04): una fila por contratista y servicio. Monto en unidad menor. */
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

/** Tipo de cambio diario (E-06): guaraníes por dólar. Carga manual; se usa el más reciente hasta la fecha del movimiento. */
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
 * Todo costo y toda venta (E-05, E-30, E-31). Centro de costo = estancia, lote, campaña y actividad.
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
    /** Foto de la factura o el ticket en R2 (E-37). */
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

/** Depósitos de una estancia: galpón, tanque de combustible o silo (E-10). Uno por estancia es el predeterminado. */
export const warehouses = sqliteTable(
  "warehouses",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: WAREHOUSE_TYPES }).notNull().default("shed"),
    /** Donde se descuentan los consumos automáticos de los registros de campo (E-13). */
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [index("warehouses_farm_idx").on(t.organizationId, t.farmId)],
);

/**
 * Movimientos de stock (E-11). El stock de un producto en un depósito es la suma de `qty`.
 * `qty` va con signo en la unidad del producto (l o kg); `valuePyg` tiene el mismo signo y es el valor en guaraníes:
 * entradas por su costo de compra, salidas al costo promedio ponderado del momento.
 * Una transferencia son dos filas (salida y entrada) con el mismo `originId`. Un consumo automático de un registro de
 * campo lleva `originId` = id del registro (E-13): se reemplaza o se revierte cuando el registro cambia o se borra.
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
    /** Total del comprobante en unidad menor de `currency` (solo compras). */
    amount: integer("amount"),
    currency: text("currency", { enum: CURRENCIES }),
    occurredAt: integer("occurred_at").notNull(),
    origin: text("origin", { enum: STOCK_ORIGINS }).notNull(),
    originId: text("origin_id"),
    partyId: text("party_id"),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [
    index("stock_moves_product_idx").on(t.organizationId, t.productId),
    index("stock_moves_warehouse_idx").on(t.warehouseId),
    index("stock_moves_origin_idx").on(t.originId),
  ],
);

// ---------- Trabajo ----------

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id"),
    assigneeId: text("assignee_id").notNull(),
    title: text("title").notNull(),
    /** Tipo de registro que abre al completarla (ej. "rain"), o null. */
    kind: text("kind", { enum: RECORD_KINDS }),
    dueDate: text("due_date").notNull(),
    /** Hora límite "HH:MM" (hora de la estancia), o null si basta con el día. */
    dueTime: text("due_time"),
    priority: text("priority", { enum: TASK_PRIORITIES }).notNull().default("normal"),
    /** JSON: comentarios de la tarea (ver taskCommentSchema). Se agregan solo por la API, nunca desde el celular. */
    comments: text("comments").notNull().default("[]"),
    recurrence: text("recurrence", { enum: RECURRENCES }).notNull().default("none"),
    status: text("status", { enum: TASK_STATUS }).notNull().default("open"),
    completedAt: integer("completed_at"),
    completedBy: text("completed_by"),
    recordId: text("record_id"),
    /** Punto al que ir (S-09: centro de un área problema). El celular lo muestra en el mapa y en "Llevame ahí". */
    lon: real("lon"),
    lat: real("lat"),
    /** Receta agronómica (JSON, ver prescriptionSchema): al hacer la tarea, la aplicación sale precargada. */
    prescription: text("prescription"),
    createdBy: text("created_by").notNull(),
    /** Lista de verificación (F-15): JSON `[{id, text, done}]` o null. Ver checklist.ts. */
    checklist: text("checklist"),
    ...synced,
  },
  (t) => [
    index("tasks_sync_idx").on(t.organizationId, t.version, t.id),
    index("tasks_assignee_idx").on(t.assigneeId, t.dueDate),
  ],
);

export const records = sqliteTable(
  "records",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id"),
    poiId: text("poi_id"),
    authorId: text("author_id").notNull(),
    kind: text("kind", { enum: RECORD_KINDS }).notNull(),
    /** JSON validado con el esquema Zod del tipo (packages/shared/src/records.ts). */
    data: text("data").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    lon: real("lon"),
    lat: real("lat"),
    gpsAccuracyM: real("gps_accuracy_m"),
    /** Hora del dispositivo. */
    capturedAt: integer("captured_at").notNull(),
    deviceId: text("device_id"),
    ...synced,
  },
  (t) => [
    index("records_sync_idx").on(t.organizationId, t.version, t.id),
    index("records_farm_captured_idx").on(t.farmId, t.capturedAt),
    index("records_plot_idx").on(t.plotId),
  ],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    recordId: text("record_id").notNull(),
    storagePath: text("storage_path").notNull(),
    thumbPath: text("thumb_path").notNull(),
    mime: text("mime").notNull(),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes"),
    uploadStatus: text("upload_status", { enum: UPLOAD_STATUS }).notNull().default("pending"),
    ...synced,
  },
  (t) => [
    index("attachments_sync_idx").on(t.organizationId, t.version, t.id),
    index("attachments_record_idx").on(t.recordId),
  ],
);

// ---------- Sincronización ----------

/** Idempotencia del push. */
export const syncMutations = sqliteTable("sync_mutations", {
  mutationId: text("mutation_id").primaryKey(),
  userId: text("user_id").notNull(),
  deviceId: text("device_id"),
  tableName: text("table_name").notNull(),
  rowId: text("row_id").notNull(),
  op: text("op").notNull(),
  receivedAt: integer("received_at").notNull(),
});

/** Fila única (id = 1) con la última versión entregada. */
export const syncSeq = sqliteTable("sync_seq", {
  id: integer("id").primaryKey(),
  v: integer("v").notNull(),
});

// ---------- Satélite y clima (escritas solo por /ingest y crons) ----------

export const scenes = sqliteTable(
  "scenes",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    itemId: text("item_id").notNull(),
    acquiredAt: integer("acquired_at").notNull(),
    cloudPct: real("cloud_pct"),
    processedAt: integer("processed_at"),
  },
  (t) => [uniqueIndex("scenes_item_uq").on(t.source, t.itemId)],
);

export const plotIndexStats = sqliteTable(
  "plot_index_stats",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    plotId: text("plot_id").notNull(),
    sceneId: text("scene_id").notNull(),
    acquiredAt: integer("acquired_at").notNull(),
    idx: text("idx").notNull().default("ndvi"),
    mean: real("mean").notNull(),
    p10: real("p10").notNull(),
    p90: real("p90").notNull(),
    validPct: real("valid_pct").notNull(),
    ...synced,
  },
  (t) => [
    uniqueIndex("plot_index_stats_uq").on(t.plotId, t.sceneId, t.idx),
    index("plot_index_stats_sync_idx").on(t.organizationId, t.version, t.id),
  ],
);

export const farmLayers = sqliteTable(
  "farm_layers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    layer: text("layer", { enum: LAYERS }).notNull(),
    acquiredAt: integer("acquired_at").notNull(),
    pmtilesPath: text("pmtiles_path").notNull(),
    bytes: integer("bytes").notNull(),
    bounds: text("bounds").notNull(),
    ...synced,
  },
  (t) => [
    index("farm_layers_sync_idx").on(t.organizationId, t.version, t.id),
    index("farm_layers_farm_idx").on(t.farmId, t.layer, t.acquiredAt),
  ],
);

/** Estado del primer procesamiento satelital por estancia. No se sincroniza: solo lo lee la web. */
export const farmImagery = sqliteTable("farm_imagery", {
  farmId: text("farm_id").primaryKey(),
  status: text("status", { enum: IMAGERY_STATUSES }).notNull().default("pending"),
  requestedAt: integer("requested_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** plot_id = "" cuando el dato es por estancia (SQLite no admite NULL útil en la PK). */
export const climateDaily = sqliteTable(
  "climate_daily",
  {
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id").notNull().default(""),
    date: text("date").notNull(),
    source: text("source").notNull(),
    precipMm: real("precip_mm"),
    tminC: real("tmin_c"),
    tmaxC: real("tmax_c"),
    soilMoisture0_7: real("soil_moisture_0_7"),
    soilMoisture7_28: real("soil_moisture_7_28"),
  },
  (t) => [primaryKey({ columns: [t.farmId, t.plotId, t.date, t.source] })],
);

export const climatology = sqliteTable(
  "climatology",
  {
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id").notNull().default(""),
    dayOfYear: integer("day_of_year").notNull(),
    variable: text("var").notNull(),
    p20: real("p20"),
    p50: real("p50"),
    p80: real("p80"),
    mean: real("mean"),
  },
  (t) => [primaryKey({ columns: [t.farmId, t.plotId, t.dayOfYear, t.variable] })],
);

/** Áreas problema dentro de un lote en la última escena (S-08). Solo las escribe /ingest; no se sincronizan. */
export const problemAreas = sqliteTable(
  "problem_areas",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id").notNull(),
    acquiredAt: integer("acquired_at").notNull(),
    geometry: text("geometry").notNull(),
    lon: real("lon").notNull(),
    lat: real("lat").notNull(),
    areaHa: real("area_ha").notNull(),
    meanNdvi: real("mean_ndvi").notNull(),
    plotMedianNdvi: real("plot_median_ndvi").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("problem_areas_plot_idx").on(t.plotId), index("problem_areas_farm_idx").on(t.farmId)],
);

/**
 * Indicador EUDR por lote (S-30): hectáreas con cobertura arbórea en 2020 y con posible pérdida hasta hoy,
 * calculado por workers-py con Sentinel-2. Una fila por lote; `changes` es un GeoJSON chico con los polígonos
 * de cambio. Análisis indicativo, no una declaración de debida diligencia. Solo lo escribe /ingest; no se sincroniza.
 */
export const eudrResults = sqliteTable(
  "eudr_results",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id").notNull(),
    /** no_change | possible_loss | no_data */
    status: text("status").notNull(),
    plotAreaHa: real("plot_area_ha").notNull(),
    forestRefHa: real("forest_ref_ha").notNull(),
    lossHa: real("loss_ha").notNull(),
    validPct: real("valid_pct").notNull(),
    refYear: integer("ref_year").notNull(),
    curYear: integer("cur_year").notNull(),
    refFromAt: integer("ref_from_at"),
    refToAt: integer("ref_to_at"),
    curFromAt: integer("cur_from_at"),
    curToAt: integer("cur_to_at"),
    refScenes: integer("ref_scenes").notNull(),
    curScenes: integer("cur_scenes").notNull(),
    /** FeatureCollection de polígonos de cambio (WGS84), con `areaHa` en las propiedades. */
    changes: text("changes").notNull(),
    computedAt: integer("computed_at").notNull(),
  },
  (t) => [uniqueIndex("eudr_results_plot_uq").on(t.plotId), index("eudr_results_farm_idx").on(t.farmId)],
);

/** Informe de riesgo climático por estancia (C-10): JSON validado con farmRiskSchema. No se sincroniza. */
export const farmRisk = sqliteTable("farm_risk", {
  farmId: text("farm_id").primaryKey(),
  computedAt: integer("computed_at").notNull(),
  report: text("report").notNull(),
});

export const forecasts = sqliteTable(
  "forecasts",
  {
    farmId: text("farm_id").notNull(),
    runAt: integer("run_at").notNull(),
    source: text("source").notNull(),
    validDate: text("valid_date").notNull(),
    tminC: real("tmin_c"),
    tmaxC: real("tmax_c"),
    precipMm: real("precip_mm"),
    windKmh: real("wind_kmh"),
    windDirDeg: real("wind_dir_deg"),
  },
  (t) => [primaryKey({ columns: [t.farmId, t.runAt, t.validDate] })],
);

/** Pronóstico horario de MET Norway (próximas horas) para las ventanas de pulverización. Solo la última corrida. */
export const forecastHours = sqliteTable(
  "forecast_hours",
  {
    farmId: text("farm_id").notNull(),
    /** Inicio de la hora, epoch ms UTC. */
    validAt: integer("valid_at").notNull(),
    tempC: real("temp_c"),
    windKmh: real("wind_kmh"),
    humidityPct: real("humidity_pct"),
    precipMm: real("precip_mm"),
  },
  (t) => [primaryKey({ columns: [t.farmId, t.validAt] })],
);

export const fireHotspots = sqliteTable(
  "fire_hotspots",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    acquiredAt: integer("acquired_at").notNull(),
    lon: real("lon").notNull(),
    lat: real("lat").notNull(),
    confidence: text("confidence"),
    frp: real("frp"),
  },
  (t) => [index("fire_hotspots_time_idx").on(t.acquiredAt)],
);

// ---------- Avisos ----------

export const alertRules = sqliteTable("alert_rules", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  kind: text("kind", { enum: ALERT_KINDS }).notNull(),
  params: text("params").notNull().default("{}"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

/** Enlace temporal de solo lectura a la ficha de una estancia (K-04). Solo se guarda el hash del token. */
export const shareLinks = sqliteTable(
  "share_links",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  (t) => [uniqueIndex("share_links_hash_uq").on(t.tokenHash), index("share_links_farm_idx").on(t.farmId)],
);

/** Umbrales de avisos por estancia (C-04). Sin fila = valores por defecto. No se sincroniza al celular. */
export const farmAlertSettings = sqliteTable("farm_alert_settings", {
  farmId: text("farm_id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  frostTminC: real("frost_tmin_c").notNull().default(2),
  excessRainMm24h: real("excess_rain_mm_24h").notNull().default(50),
  droughtDeficitPct: real("drought_deficit_pct").notNull().default(50),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

/** Carga animal máxima (UA/ha) por estancia (G-03). Sin fila = DEFAULT_MAX_UA_PER_HA. No se sincroniza. */
export const farmLivestockSettings = sqliteTable("farm_livestock_settings", {
  farmId: text("farm_id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  maxUaPerHa: real("max_ua_per_ha").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

/**
 * Calendario sanitario de la organización (G-10). Solo web: el celular recibe las tareas que se crean para
 * los empleados. farm_id vacío = toda la organización. El estado (hecho o vencido) se calcula, no se guarda.
 */
export const sanitaryEvents = sqliteTable(
  "sanitary_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id"),
    reason: text("reason", { enum: HEALTH_REASONS }).notNull(),
    /** "YYYY-MM-DD". */
    plannedDate: text("planned_date").notNull(),
    /** JSON: categorías de hacienda alcanzadas (vacío = todas). */
    categories: text("categories").notNull().default("[]"),
    product: text("product"),
    note: text("note"),
    tasksCreated: integer("tasks_created").notNull().default(0),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [index("sanitary_events_org_date_idx").on(t.organizationId, t.plannedDate)],
);

export const alerts = sqliteTable(
  "alerts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    kind: text("kind", { enum: ALERT_KINDS }).notNull(),
    severity: text("severity", { enum: ALERT_SEVERITIES }).notNull(),
    probability: text("probability", { enum: ALERT_PROBABILITIES }),
    validFrom: integer("valid_from").notNull(),
    validTo: integer("valid_to"),
    /** Copia para el cliente; la consulta por lote usa alert_plots. */
    plotIds: text("plot_ids").notNull().default("[]"),
    summary: text("summary").notNull(),
    details: text("details").notNull().default("{}"),
    source: text("source").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    resolvedAt: integer("resolved_at"),
    ...synced,
  },
  (t) => [
    uniqueIndex("alerts_dedupe_uq").on(t.dedupeKey),
    index("alerts_sync_idx").on(t.organizationId, t.version, t.id),
  ],
);

export const alertPlots = sqliteTable(
  "alert_plots",
  {
    alertId: text("alert_id").notNull(),
    plotId: text("plot_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.alertId, t.plotId] }), index("alert_plots_plot_idx").on(t.plotId)],
);

export const alertFeedback = sqliteTable(
  "alert_feedback",
  {
    alertId: text("alert_id").notNull(),
    userId: text("user_id").notNull(),
    useful: integer("useful", { mode: "boolean" }).notNull(),
    comment: text("comment"),
  },
  (t) => [primaryKey({ columns: [t.alertId, t.userId] })],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    alertId: text("alert_id"),
    channel: text("channel", { enum: ["push", "email"] }).notNull(),
    status: text("status", { enum: ["pending", "sent", "failed"] })
      .notNull()
      .default("pending"),
    sentAt: integer("sent_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("notifications_pending_idx").on(t.status, t.createdAt)],
);

/**
 * P-03: analítica propia, sin terceros. Los pasos del embudo (FUNNEL_EVENTS) se guardan una vez por organización
 * (índice único parcial); el resto son eventos de uso que manda el cliente por POST /events, con muestreo.
 */
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    ts: integer("ts").notNull(),
  },
  (t) => [
    index("events_name_ts_idx").on(t.name, t.ts),
    index("events_user_ts_idx").on(t.userId, t.ts),
    uniqueIndex("events_funnel_uq")
      .on(t.organizationId, t.name)
      .where(sql`name IN ('signup', 'farm_created', 'plots_created', 'member_added', 'first_record')`),
  ],
);

/** U-29: preferencias de notificación por usuario (JSON validado con notificationPrefsSchema). No se sincroniza. */
export const notificationPrefs = sqliteTable("notification_prefs", {
  userId: text("user_id").primaryKey(),
  prefs: text("prefs").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** P-12: registro de auditoría de acciones del equipo de Yvy sobre organizaciones de clientes. */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    organizationId: text("organization_id"),
    detail: text("detail").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("audit_log_org_idx").on(t.organizationId, t.createdAt)],
);

// ---------- Reportes ----------

export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    kind: text("kind", { enum: ["weekly", "season"] }).notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    storagePath: text("storage_path"),
    status: text("status", { enum: ["pending", "done", "failed"] })
      .notNull()
      .default("pending"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("reports_farm_idx").on(t.farmId, t.periodStart)],
);

// ---------- Operación ----------

/** Un registro por usuario y día con actividad (métricas del PRD §4; 1 escritura por día). */
export const activityDaily = sqliteTable(
  "activity_daily",
  {
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    day: text("day").notNull(),
    role: text("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] }), index("activity_daily_org_idx").on(t.organizationId, t.day)],
);

/** P-09: el dueño pide la baja de la cuenta. Solo se registra; el borrado lo hace el equipo a mano. */
export const deletionRequests = sqliteTable(
  "deletion_requests",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    userId: text("user_id").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("deletion_requests_org_idx").on(t.organizationId, t.createdAt)],
);

export const usageDaily = sqliteTable(
  "usage_daily",
  {
    day: text("day").notNull(),
    metric: text("metric").notNull(),
    value: real("value").notNull(),
    limit: real("limit"),
  },
  (t) => [primaryKey({ columns: [t.day, t.metric] })],
);
