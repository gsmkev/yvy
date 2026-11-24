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
/** Unidad de la densidad de siembra: semillas por metro lineal o kg por hectárea. */
export const DENSITY_UNITS = ["seeds_m", "kg_ha"] as const;
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
export type PoiKind = (typeof POI_KINDS)[number];
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
  // G-33: ración suministrada a un corral (feedlot)
  "feed",
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
/** Tipos de producto del catálogo (ADR 0004). */
export const PRODUCT_TYPES = ["seed", "agrochemical", "fertilizer", "fuel", "veterinary", "other"] as const;
/** Unidad base del producto: litros o kilos. */
export const PRODUCT_UNITS = ["l", "kg"] as const;
export const UPLOAD_STATUS = ["pending", "uploaded"] as const;
export const ALERT_KINDS = ["frost", "excess_rain", "drought", "fire", "pest_threshold", "water_low", "heat_stress", "rust_risk", "senacsa"] as const;
export const ALERT_SEVERITIES = ["info", "watch", "warning"] as const;
/** Con MET Norway no hay ensemble: probabilidad cualitativa (PRD-cloudflare §4.8). */
export const ALERT_PROBABILITIES = ["low", "medium", "high"] as const;
/** P-10: estados de un pedido de cambio de plan (lo aprueba el panel interno; no hay cobro automático). */
export const PLAN_REQUEST_STATUS = ["pending", "approved", "rejected", "cancelled"] as const;
/** P-10: planes que el dueño puede pedir desde la web. */
export const REQUESTABLE_PLANS = ["active"] as const;
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
