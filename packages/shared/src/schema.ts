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
import { ACTIVITIES, CASH_ACCOUNT_TYPES, CATTLE_DEAL_KINDS, CONTRACTOR_SERVICES, COST_CATEGORIES, CURRENCIES, EMPLOYEE_PAYMENT_KINDS, MACHINE_TYPES, MAINTENANCE_KINDS, METER_KINDS, PARTY_KINDS, RATE_UNITS, STOCK_ORIGINS, WAREHOUSE_TYPES } from "./erp";
import { ANIMAL_SEXES } from "./animals";
import { HEALTH_REASONS, HERD_CATEGORIES } from "./livestock";
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// ---------- Enums ----------

/**
 * `supervisor` (T-09, capataz): ve y asigna solo dentro de las estancias que se le dan (tabla farm_access).
 * `contractor` (K-03): como el empleado, pero externo: solo los lotes y tareas que se le asignan, sin catálogo ni campañas.
 */
export const ROLES = ["owner", "admin", "agronomist", "supervisor", "worker", "contractor"] as const;
export type Role = (typeof ROLES)[number];
/** Roles de campo: ven solo sus lotes asignados y sus tareas (el celular sin las pantallas de gestión). */
export const FIELD_ROLES = ["worker", "contractor"] as const;
export const isFieldRole = (r: string): boolean => (FIELD_ROLES as readonly string[]).includes(r);
/** K-05: nivel de acceso a una estancia concreta. `view` = solo lectura. */
export const FARM_ACCESS_LEVELS = ["view", "edit"] as const;
export type FarmAccessLevel = (typeof FARM_ACCESS_LEVELS)[number];
export const MEMBERSHIP_STATUS = ["active", "invited", "disabled"] as const;
export const PLOT_KINDS = ["crop", "pasture"] as const;
export const CROPS = ["soja", "maiz", "trigo", "arroz", "girasol", "chia", "otro"] as const;
export const SEASONS = ["zafra", "zafrina"] as const;
export const POI_KINDS = [
  "rain_gauge",
  "water",
  "house",
  "school",
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
/** Líneas del mapa (M-20): alambrados, caminos internos, cañerías y cursos de agua (A-15). */
export const LINE_KINDS = ["fence", "road", "pipe", "stream"] as const;
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
  "stock_count",
  "health",
  "theft",
  "supplement",
  "weighing",
  "reproduction",
  // ADR 0004: registros agrícolas
  "sowing",
  "irrigation",
  "application",
  "fertilization",
  "harvest",
  // F-05: recorrida GPS grabada a pedido
  "track",
  // ADR 0004: ERP
  "fuel_load",
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
/** Tipos de producto del catálogo (ADR 0004). */
export const PRODUCT_TYPES = ["seed", "agrochemical", "fertilizer", "fuel", "veterinary", "other"] as const;
/** Unidad base del producto: litros o kilos. */
export const PRODUCT_UNITS = ["l", "kg"] as const;
export const UPLOAD_STATUS = ["pending", "uploaded"] as const;
export const ALERT_KINDS = ["frost", "excess_rain", "drought", "fire", "pest_threshold", "water_low", "heat_stress", "rust_risk"] as const;
export const ALERT_SEVERITIES = ["info", "watch", "warning"] as const;
/** Con MET Norway no hay ensemble: probabilidad cualitativa (PRD-cloudflare §4.8). */
export const ALERT_PROBABILITIES = ["low", "medium", "high"] as const;
/** P-03: pasos del embudo de activación. Los escribe el servidor, una sola vez por organización. */
export const FUNNEL_EVENTS = ["signup", "farm_created", "plots_created", "member_added", "first_record"] as const;
/** S-07: índices de vegetación que calcula el job de Sentinel-2. */
export const INDEX_KINDS = ["ndvi", "ndre", "ndmi", "evi"] as const;
export type IndexKind = (typeof INDEX_KINDS)[number];
/** A-31: mapas de fertilidad interpolados (pH, fósforo, potasio, materia orgánica) a partir de análisis de suelo con punto. */
export const FERT_LAYERS = ["fert_ph", "fert_p", "fert_k", "fert_om"] as const;
export type FertLayer = (typeof FERT_LAYERS)[number];
export const LAYERS = ["true_color", ...INDEX_KINDS, ...FERT_LAYERS] as const;
/** M-17: capas propias (imagen georreferenciada) de una estancia. */
export const CUSTOM_LAYER_KINDS = ["image", "geotiff"] as const;
export const CUSTOM_LAYER_STATUSES = ["processing", "ready", "failed"] as const;
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
  /** V-06: el equipo anotó el crédito del referido (cuando la organización referida pasó a pagar). null = sin anotar. */
  referralCreditedAt: integer("referral_credited_at"),
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

/**
 * Análisis de suelo de laboratorio (A-30): por lote o por punto de muestreo. Solo la web lo usa por ahora
 * (no está en el pull del sync). Valores nulos = el laboratorio no lo informó.
 */
export const soilSamples = sqliteTable(
  "soil_samples",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id"),
    /** Nombre o número del punto de muestreo ("P-07"). */
    pointLabel: text("point_label"),
    lon: real("lon"),
    lat: real("lat"),
    /** Fecha de muestreo "YYYY-MM-DD". */
    sampledOn: text("sampled_on").notNull(),
    depthCm: integer("depth_cm").notNull().default(20),
    lab: text("lab"),
    ph: real("ph"),
    /** Fósforo (Mehlich-1), mg/kg. */
    pMgKg: real("p_mg_kg"),
    /** Potasio, cmolc/kg. */
    kCmolKg: real("k_cmol_kg"),
    /** Materia orgánica, %. */
    omPct: real("om_pct"),
    note: text("note"),
    ...synced,
  },
  (t) => [
    index("soil_samples_sync_idx").on(t.organizationId, t.version, t.id),
    index("soil_samples_farm_idx").on(t.farmId),
    index("soil_samples_plot_idx").on(t.plotId),
  ],
);

/**
 * Entrega de grano a un acopio o silo (A-23): ticket de balanza con humedad, descuentos y neto, por lote.
 * Pesos en kilos. Solo la web la usa (no está en el pull del sync).
 */
export const grainDeliveries = sqliteTable(
  "grain_deliveries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id"),
    seasonId: text("season_id"),
    crop: text("crop", { enum: CROPS }).notNull(),
    ticket: text("ticket").notNull(),
    silo: text("silo").notNull(),
    deliveredOn: text("delivered_on").notNull(),
    grossKg: real("gross_kg").notNull(),
    moisturePct: real("moisture_pct"),
    baseMoisturePct: real("base_moisture_pct").notNull(),
    impuritiesPct: real("impurities_pct").notNull().default(0),
    otherKg: real("other_kg").notNull().default(0),
    /** Calculado al guardar con grainNet (packages/shared). */
    netKg: real("net_kg").notNull(),
    note: text("note"),
    /** E-34: contrato de venta al que se entregó (vacío = entrega a acopio sin contrato). */
    contractId: text("contract_id"),
    ...synced,
  },
  (t) => [
    index("grain_deliveries_contract_idx").on(t.organizationId, t.contractId),
    index("grain_deliveries_sync_idx").on(t.organizationId, t.version, t.id),
    index("grain_deliveries_farm_idx").on(t.farmId, t.deliveredOn),
    index("grain_deliveries_plot_idx").on(t.plotId),
  ],
);

/**
 * Mapa de rendimiento de la cosechadora de un lote en una campaña (A-21). El archivo (shapefile) se procesa en el
 * navegador; acá queda el resumen y una grilla de promedios en `cells` (JSON [[lon, lat, t/ha, puntos], ...]).
 * Solo la web lo usa (no está en el pull del sync).
 */
export const yieldMaps = sqliteTable(
  "yield_maps",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id").notNull(),
    seasonId: text("season_id"),
    fileName: text("file_name").notNull(),
    nPoints: integer("n_points").notNull(),
    nDropped: integer("n_dropped").notNull(),
    meanTHa: real("mean_t_ha").notNull(),
    p10THa: real("p10_t_ha").notNull(),
    p90THa: real("p90_t_ha").notNull(),
    minTHa: real("min_t_ha").notNull(),
    maxTHa: real("max_t_ha").notNull(),
    cvPct: real("cv_pct").notNull(),
    cellM: integer("cell_m").notNull(),
    cells: text("cells").notNull(),
    ...synced,
  },
  (t) => [
    index("yield_maps_sync_idx").on(t.organizationId, t.version, t.id),
    index("yield_maps_plot_idx").on(t.plotId, t.seasonId),
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

/**
 * Animales con caravana (G-21). La hacienda sigue contándose por potrero y categoría; esta tabla es para quien
 * identifica a algunos animales individualmente. La caravana es única en la organización entre los no borrados.
 */
export const animals = sqliteTable(
  "animals",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    /** En mayúsculas (ver normalizeTag). */
    tag: text("tag").notNull(),
    category: text("category", { enum: HERD_CATEGORIES }).notNull(),
    sex: text("sex", { enum: ANIMAL_SEXES }).notNull(),
    birthDate: text("birth_date"),
    note: text("note"),
    ...synced,
  },
  (t) => [
    uniqueIndex("animals_org_tag_uq")
      .on(t.organizationId, t.tag)
      .where(sql`deleted_at IS NULL`),
    index("animals_sync_idx").on(t.organizationId, t.version, t.id),
    index("animals_farm_idx").on(t.farmId),
  ],
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
    ...synced,
  },
  (t) => [index("warehouses_farm_idx").on(t.organizationId, t.farmId), index("warehouses_sync_idx").on(t.organizationId, t.version, t.id)],
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
    /** Lote y vencimiento ("YYYY-MM-DD") de lo comprado: agroquímicos y vacunas (E-12). */
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
    /** Foto de la factura o el ticket en R2 (E-37). */
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
    /** Orden de trabajo (JSON, ver orderSchema): labor, insumos, máquina y contratista. Baja al celular (E-20). */
    workOrder: text("work_order"),
    ...synced,
  },
  (t) => [
    index("tasks_sync_idx").on(t.organizationId, t.version, t.id),
    index("tasks_assignee_idx").on(t.assigneeId, t.dueDate),
  ],
);

/** Stock mínimo por producto y depósito (E-14). Tabla de oficina: no se sincroniza. */
export const stockMinimums = sqliteTable(
  "stock_minimums",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    productId: text("product_id").notNull(),
    warehouseId: text("warehouse_id").notNull(),
    /** En la unidad base del producto (l o kg). */
    minQty: real("min_qty").notNull(),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("stock_minimums_uq").on(t.organizationId, t.productId, t.warehouseId)],
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

/**
 * T-08: comentarios sobre un registro, con menciones (`@Ramón mirá esto`). Se sincroniza; cada comentario es una fila
 * propia (a diferencia de los de las tareas, que van en un JSON) para que dos personas comentando offline no se pisen.
 */
export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    recordId: text("record_id").notNull(),
    authorId: text("author_id").notNull(),
    /** Nombre del autor al comentar (el celular no tiene la tabla de usuarios). */
    authorName: text("author_name").notNull().default(""),
    body: text("body").notNull(),
    /** JSON: ids de usuario mencionados (miembros de la organización). */
    mentions: text("mentions").notNull().default("[]"),
    ...synced,
  },
  (t) => [
    index("comments_sync_idx").on(t.organizationId, t.version, t.id),
    index("comments_record_idx").on(t.recordId, t.createdAt),
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
    /** S-11: lote de menos de 30 m de ancho; los píxeles mezclan con el borde y el dato es poco confiable. */
    lowConfidence: integer("low_confidence", { mode: "boolean" }).notNull().default(false),
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

/**
 * Capa propia de una estancia (M-17): imagen de dron, mapa de suelos o cualquier PNG/JPG con 4 esquinas. El archivo
 * original va a R2 (bucket de media); un GeoTIFF lo convierte workers-py a PNG georreferenciado en WGS84.
 * `corners` = [[lon, lat] × 4] en orden arriba-izq., arriba-der., abajo-der., abajo-izq. Solo la web la usa (no está en el pull).
 */
export const customLayers = sqliteTable(
  "custom_layers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: CUSTOM_LAYER_KINDS }).notNull(),
    status: text("status", { enum: CUSTOM_LAYER_STATUSES }).notNull(),
    mime: text("mime").notNull(),
    originalPath: text("original_path").notNull(),
    /** PNG/JPG que se dibuja en el mapa; null mientras un GeoTIFF se procesa. */
    imagePath: text("image_path"),
    imageMime: text("image_mime"),
    bytes: integer("bytes").notNull(),
    corners: text("corners"),
    ...synced,
  },
  (t) => [
    index("custom_layers_sync_idx").on(t.organizationId, t.version, t.id),
    index("custom_layers_farm_idx").on(t.farmId, t.status),
  ],
);

/** Estado del primer procesamiento satelital por estancia. No se sincroniza: solo lo lee la web. */
export const farmImagery = sqliteTable("farm_imagery", {
  farmId: text("farm_id").primaryKey(),
  status: text("status", { enum: IMAGERY_STATUSES }).notNull().default("pending"),
  requestedAt: integer("requested_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** S-03: estado de la historia de vigor desde 2017 pedida a demanda por estancia. No se sincroniza. */
export const HISTORY_STATUSES = ["processing", "done", "failed"] as const;
export const farmHistory = sqliteTable("farm_history", {
  farmId: text("farm_id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  status: text("status", { enum: HISTORY_STATUSES }).notNull(),
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

/** F-14: campos propios por tipo de registro de cada organización (JSON validado con formConfigSchema). No se sincroniza: la app lo pide por /org/form-config. */
export const formConfigs = sqliteTable("form_configs", {
  organizationId: text("organization_id").primaryKey(),
  config: text("config").notNull(),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

/** Análisis por lote calculados por workers-py con Sentinel-2: área quemada (S-20) y cambio de cobertura (S-31). */
export const ANALYSIS_KINDS = ["burned", "cover_change"] as const;
export type AnalysisKind = (typeof ANALYSIS_KINDS)[number];

/**
 * Una fila por lote, tipo de análisis y referencia (burned: fecha ISO del primer foco; cover_change: "desde_hasta").
 * `metrics` es un JSON chico según el tipo y `changes` un FeatureCollection con los polígonos. Solo lo escribe
 * /ingest; no se sincroniza. Análisis indicativo.
 */
export const plotAnalyses = sqliteTable(
  "plot_analyses",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id").notNull(),
    kind: text("kind", { enum: ANALYSIS_KINDS }).notNull(),
    refKey: text("ref_key").notNull(),
    /** Fecha de la imagen "antes" y de la imagen "después". */
    fromAt: integer("from_at"),
    toAt: integer("to_at"),
    plotAreaHa: real("plot_area_ha").notNull(),
    validPct: real("valid_pct").notNull(),
    metrics: text("metrics").notNull(),
    changes: text("changes").notNull(),
    computedAt: integer("computed_at").notNull(),
  },
  (t) => [
    uniqueIndex("plot_analyses_uq").on(t.plotId, t.kind, t.refKey),
    index("plot_analyses_farm_idx").on(t.farmId, t.kind),
  ],
);

/** Pedidos a demanda de análisis pesados por estancia (S-31). No se sincroniza. */
export const analysisJobs = sqliteTable(
  "analysis_jobs",
  {
    farmId: text("farm_id").notNull(),
    kind: text("kind", { enum: ANALYSIS_KINDS }).notNull(),
    organizationId: text("organization_id").notNull(),
    status: text("status", { enum: HISTORY_STATUSES }).notNull(),
    /** Parámetros del pedido (JSON): fechas del cambio de cobertura. */
    params: text("params").notNull().default("{}"),
    requestedAt: integer("requested_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.farmId, t.kind] })],
);

/** Informe de riesgo climático por estancia (C-10): JSON validado con farmRiskSchema. No se sincroniza. */
export const farmRisk = sqliteTable("farm_risk", {
  farmId: text("farm_id").primaryKey(),
  computedAt: integer("computed_at").notNull(),
  report: text("report").notNull(),
});

/** SPI a 1, 3 y 6 meses por estancia (C-07): JSON validado con farmSpiSchema. Una fila por estancia; no se sincroniza. */
export const farmSpi = sqliteTable("farm_spi", {
  farmId: text("farm_id").primaryKey(),
  computedAt: integer("computed_at").notNull(),
  report: text("report").notNull(),
});

/**
 * R-08: comparación anónima de una estancia con la mediana de las estancias de otras organizaciones dentro de un radio.
 * La calcula un cron con acceso de sistema; acá solo quedan números de la propia estancia, las medianas y cuántas
 * estancias entraron (nunca ids, nombres ni geometrías ajenas). Una fila por estancia; si dejan de alcanzar los
 * vecinos, la fila se borra. No se sincroniza.
 */
export const zoneBenchmarks = sqliteTable("zone_benchmarks", {
  farmId: text("farm_id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  computedAt: integer("computed_at").notNull(),
  radiusKm: integer("radius_km").notNull(),
  windowDays: integer("window_days").notNull(),
  nFarms: integer("n_farms").notNull(),
  ndvi: real("ndvi"),
  ndviMedian: real("ndvi_median"),
  rainMm: real("rain_mm"),
  rainMedianMm: real("rain_median_mm"),
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

/**
 * Pronóstico diario de MET Norway por lote en estancias de más de 2.000 ha (C-03), en el centro del lote.
 * Solo la última corrida (se reemplaza). No se sincroniza.
 */
export const plotForecasts = sqliteTable(
  "plot_forecasts",
  {
    plotId: text("plot_id").notNull(),
    farmId: text("farm_id").notNull(),
    validDate: text("valid_date").notNull(),
    runAt: integer("run_at").notNull(),
    tminC: real("tmin_c"),
    tmaxC: real("tmax_c"),
    precipMm: real("precip_mm"),
    windKmh: real("wind_kmh"),
  },
  (t) => [primaryKey({ columns: [t.plotId, t.validDate] }), index("plot_forecasts_farm_idx").on(t.farmId)],
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
    /** T-08: aviso de mención en un comentario (en vez de un aviso agronómico). */
    commentId: text("comment_id"),
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

/**
 * Registro de auditoría. P-12: acciones del equipo de Yvy sobre organizaciones de clientes. K-06: quién cambió qué y
 * cuándo dentro de la organización (estancias, lotes, miembros, tareas, borrado de registros).
 */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    organizationId: text("organization_id"),
    /** K-06: qué se tocó (`farm`, `plot`, `member`, `task`, `record`...) y su id. Las acciones del equipo de Yvy no lo llevan. */
    entity: text("entity"),
    entityId: text("entity_id"),
    detail: text("detail").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("audit_log_org_idx").on(t.organizationId, t.createdAt),
    index("audit_log_entity_idx").on(t.organizationId, t.entity, t.entityId),
  ],
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

/**
 * R-10: destinatarios externos (socio, agrónomo, banco) del parte semanal con PDF. `farmId` null = todas las
 * estancias de la organización. No se sincroniza.
 */
export const reportSchedules = sqliteTable(
  "report_schedules",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    frequency: text("frequency", { enum: ["weekly", "monthly"] }).notNull(),
    lastSentAt: integer("last_sent_at"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [index("report_schedules_org_idx").on(t.organizationId, t.farmId)],
);

/**
 * I-01: tokens de la API pública (solo lectura) por organización. Solo se guarda el SHA-256 del token; `prefix` son
 * los primeros caracteres, para reconocerlo en la lista. No se sincroniza.
 */
export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    prefix: text("prefix").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    lastUsedAt: integer("last_used_at"),
    revokedAt: integer("revoked_at"),
  },
  (t) => [uniqueIndex("api_tokens_hash_uq").on(t.tokenHash), index("api_tokens_org_idx").on(t.organizationId)],
);

/** I-01: pedidos por token y minuto (ventana fija) para el límite de uso. Se limpia en el cron diario. */
export const apiRate = sqliteTable(
  "api_rate",
  {
    tokenId: text("token_id").notNull(),
    window: integer("window").notNull(),
    n: integer("n").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tokenId, t.window] })],
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

/**
 * Zonas de manejo de un lote (A-32): 3 zonas (1 = menor vigor relativo, 3 = mayor) calculadas por workers-py con k-means
 * sobre el NDVI máximo de varias campañas. Una fila por lote y zona; `geometry` es un MultiPolygon GeoJSON simplificado.
 * Solo las escribe /ingest; no se sincronizan.
 */
export const managementZones = sqliteTable(
  "management_zones",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    farmId: text("farm_id").notNull(),
    plotId: text("plot_id").notNull(),
    zone: integer("zone").notNull(),
    areaHa: real("area_ha").notNull(),
    pct: real("pct").notNull(),
    meanNdvi: real("mean_ndvi").notNull(),
    /** Años de inicio de las campañas usadas, JSON [2023, 2024, 2025]. */
    seasons: text("seasons").notNull(),
    geometry: text("geometry").notNull(),
    computedAt: integer("computed_at").notNull(),
  },
  (t) => [uniqueIndex("management_zones_plot_zone_uq").on(t.plotId, t.zone), index("management_zones_farm_idx").on(t.farmId)],
);

/**
 * T-09 / K-05: estancias a las que se limita a una persona. No se sincroniza.
 * `supervisor`: sin filas no ve ninguna estancia. `admin` y `agronomist`: sin filas ven todas; con filas, solo esas
 * (y `view` las deja en solo lectura). El dueño y los roles de campo no usan esta tabla.
 */
export const farmAccess = sqliteTable(
  "farm_access",
  {
    organizationId: text("organization_id").notNull(),
    userId: text("user_id").notNull(),
    farmId: text("farm_id").notNull(),
    level: text("level", { enum: FARM_ACCESS_LEVELS }).notNull().default("edit"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId, t.farmId] }), index("farm_access_farm_idx").on(t.farmId)],
);

// ---------- ERP, segunda tanda (ADR 0004): tablas de oficina, no se sincronizan ----------

/** Plan de mantenimiento preventivo de una máquina: cada tantas horas o kilómetros (E-22). */
export const maintenancePlans = sqliteTable(
  "maintenance_plans",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    machineId: text("machine_id").notNull(),
    name: text("name").notNull(),
    /** Cada cuántas horas o kilómetros (según el medidor de la máquina). */
    everyUnits: real("every_units").notNull(),
    /** Lectura del medidor en el último servicio. */
    lastDoneMeter: real("last_done_meter").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("maintenance_plans_machine_idx").on(t.organizationId, t.machineId)],
);

/** Historial de servicios y reparaciones de una máquina, con su costo (E-22). */
export const maintenanceLogs = sqliteTable(
  "maintenance_logs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    machineId: text("machine_id").notNull(),
    planId: text("plan_id"),
    kind: text("kind", { enum: MAINTENANCE_KINDS }).notNull(),
    occurredAt: integer("occurred_at").notNull(),
    meterValue: real("meter_value"),
    description: text("description"),
    partyId: text("party_id"),
    amount: integer("amount"),
    currency: text("currency", { enum: CURRENCIES }),
    amountPyg: integer("amount_pyg"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [index("maintenance_logs_machine_idx").on(t.organizationId, t.machineId, t.occurredAt)],
);

/** Datos para costear el trabajo propio de una máquina (E-23): amortización, operario, rendimiento y combustible. */
export const machineCosts = sqliteTable(
  "machine_costs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    machineId: text("machine_id").notNull(),
    /** Labor que hace la máquina: se compara con los contratistas de ese servicio. */
    service: text("service", { enum: CONTRACTOR_SERVICES }).notNull(),
    /** Valor de compra y de reventa estimado, en guaraníes. */
    purchasePricePyg: integer("purchase_price_pyg").notNull().default(0),
    residualPyg: integer("residual_pyg").notNull().default(0),
    /** Vida útil en horas de motor. */
    lifeHours: real("life_hours").notNull().default(0),
    /** Costo del operario por hora, en guaraníes. */
    operatorPerHourPyg: integer("operator_per_hour_pyg").notNull().default(0),
    /** Hectáreas por hora de trabajo. */
    haPerHour: real("ha_per_hour"),
    /** Litros por hora (si no se carga, sale de las cargas de combustible) y precio del litro (si no, el costo del stock). */
    fuelLitersPerHour: real("fuel_liters_per_hour"),
    fuelPricePyg: integer("fuel_price_pyg"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("machine_costs_machine_uq").on(t.organizationId, t.machineId)],
);

/** Personal (peones, capataz, administrativos) con su jornal. Puede o no tener usuario en la app (E-25). */
export const employees = sqliteTable(
  "employees",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    /** Cédula de identidad. */
    ci: text("ci"),
    phone: text("phone"),
    /** Jornal por día completo, en guaraníes. */
    dailyWagePyg: integer("daily_wage_pyg").notNull().default(0),
    /** Si trabaja con la app, su usuario (sin cargarlo dos veces). */
    userId: text("user_id"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("employees_org_idx").on(t.organizationId, t.name)],
);

/** Asistencia y jornal de un día, con el lote y la labor (E-25). Genera un costo de mano de obra. */
export const attendance = sqliteTable(
  "attendance",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    employeeId: text("employee_id").notNull(),
    /** "YYYY-MM-DD". */
    date: text("date").notNull(),
    /** 1 = día completo, 0.5 = medio día. */
    days: real("days").notNull(),
    farmId: text("farm_id"),
    plotId: text("plot_id"),
    seasonId: text("season_id"),
    labor: text("labor"),
    /** Jornal del día en guaraníes (el jornal vigente por los días, o el que se cargó a mano). */
    wagePyg: integer("wage_pyg").notNull(),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [
    index("attendance_date_idx").on(t.organizationId, t.date),
    index("attendance_employee_idx").on(t.organizationId, t.employeeId, t.date),
  ],
);

/** Adelantos y pagos a un empleado, en guaraníes (E-26). El saldo es lo devengado (asistencia) menos esto. */
export const employeePayments = sqliteTable(
  "employee_payments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    employeeId: text("employee_id").notNull(),
    /** "YYYY-MM-DD". */
    date: text("date").notNull(),
    kind: text("kind", { enum: EMPLOYEE_PAYMENT_KINDS }).notNull(),
    amountPyg: integer("amount_pyg").notNull(),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [index("employee_payments_idx").on(t.organizationId, t.employeeId, t.date)],
);

/** Presupuesto de campaña: una línea por lote, cultivo o toda la campaña, con actividad y rubro (E-32). */
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

/** Compra a un proveedor: orden, factura y recepción en depósito (E-33). */
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
    /** Vencimiento de la factura: de acá salen las cuentas a pagar (E-36). */
    dueDate: text("due_date"),
    /** Lo ya pagado, en unidad menor de `currency` (E-36). */
    paidAmount: integer("paid_amount").notNull().default(0),
    warehouseId: text("warehouse_id"),
    receivedAt: text("received_at"),
    note: text("note"),
    /** Foto de la factura en R2 (E-37). */
    photoPath: text("photo_path"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [index("purchases_org_idx").on(t.organizationId, t.orderDate), index("purchases_due_idx").on(t.organizationId, t.dueDate)],
);

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

/** Contrato de venta de granos a un comprador (E-34). */
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

/** Liquidación de un contrato: toneladas, precio, descuentos y neto. Es un ingreso y una cuenta a cobrar (E-34, E-36). */
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
    /** Lo ya cobrado, en unidad menor de `currency` (E-36). */
    paidAmount: integer("paid_amount").notNull().default(0),
    photoPath: text("photo_path"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [index("grain_settlements_contract_idx").on(t.organizationId, t.contractId), index("grain_settlements_due_idx").on(t.organizationId, t.dueDate)],
);

/** Compra o venta de hacienda: cabezas, kilos, precio y guía de traslado (E-35). */
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
    /** Lo ya pagado o cobrado, en unidad menor de `currency` (E-36). */
    paidAmount: integer("paid_amount").notNull().default(0),
    photoPath: text("photo_path"),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [index("cattle_deals_org_idx").on(t.organizationId, t.date), index("cattle_deals_due_idx").on(t.organizationId, t.dueDate)],
);

/** Caja o cuenta bancaria en una moneda (E-36). */
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

/** Movimiento de una cuenta: entra con signo positivo, sale con negativo, en la moneda de la cuenta (E-36). */
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

/** Plan de cuentas del contador: a qué cuenta va cada rubro al exportar (E-38). Sin fila, rige el plan de ejemplo. */
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
