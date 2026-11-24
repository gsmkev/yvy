/**
 * Enumeraciones compartidas por el esquema, el Worker y las apps: roles, cultivos, tipos de registro, avisos y capas.
 */

// ---------- Enums ----------

/**
 * `supervisor` (capataz): ve y asigna solo dentro de las estancias que se le dan (tabla farm_access).
 * `contractor`: como el empleado, pero externo: solo los lotes y tareas que se le asignan, sin catálogo ni campañas.
 */
export const ROLES = ["owner", "admin", "agronomist", "supervisor", "worker", "contractor"] as const;
/** Rol de una persona dentro de una organización. */
export type Role = (typeof ROLES)[number];
/** Roles de campo: ven solo sus lotes asignados y sus tareas (el celular sin las pantallas de gestión). */
export const FIELD_ROLES = ["worker", "contractor"] as const;
/** Si el rol es de campo (empleado o contratista). */
export const isFieldRole = (r: string): boolean => (FIELD_ROLES as readonly string[]).includes(r);
/** Nivel de acceso a una estancia concreta. `view` = solo lectura. */
export const FARM_ACCESS_LEVELS = ["view", "edit"] as const;
/** Nivel de acceso a una estancia. */
export type FarmAccessLevel = (typeof FARM_ACCESS_LEVELS)[number];
/** Estados de una membresía. */
export const MEMBERSHIP_STATUS = ["active", "invited", "disabled"] as const;
/** Tipos de lote: agrícola o pastura. */
export const PLOT_KINDS = ["crop", "pasture"] as const;
/** Cultivos del catálogo. */
export const CROPS = ["soja", "maiz", "trigo", "arroz", "girasol", "chia", "otro"] as const;
/** Épocas de siembra. */
export const SEASONS = ["zafra", "zafrina"] as const;
/** Unidad de la densidad de siembra: semillas por metro lineal o kg por hectárea. */
export const DENSITY_UNITS = ["seeds_m", "kg_ha"] as const;
/** Tipos de punto de interés del mapa. */
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
/** Tipo de punto de interés del mapa. */
export type PoiKind = (typeof POI_KINDS)[number];
/** Líneas del mapa: alambrados, caminos internos, cañerías y cursos de agua. */
export const LINE_KINDS = ["fence", "road", "pipe", "stream"] as const;
/** Tipo de línea del mapa. */
export type LineKind = (typeof LINE_KINDS)[number];
/** Repeticiones de una tarea. */
export const RECURRENCES = ["none", "daily", "weekly"] as const;
/** Estados de una tarea. */
export const TASK_STATUS = ["open", "done", "cancelled"] as const;
/** Prioridades de una tarea. */
export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
/** Tipos de registro de campo. */
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
  // registros agrícolas
  "sowing",
  "irrigation",
  "application",
  "fertilization",
  "harvest",
  // Recorrida GPS grabada a pedido
  "track",
  // ERP
  "fuel_load",
  // Ración suministrada a un corral (feedlot)
  "feed",
] as const;
/** Tipo de registro de campo. */
export type RecordKind = (typeof RECORD_KINDS)[number];
/** Tipos de producto del catálogo . */
export const PRODUCT_TYPES = ["seed", "agrochemical", "fertilizer", "fuel", "veterinary", "other"] as const;
/** Unidad base del producto: litros o kilos. */
export const PRODUCT_UNITS = ["l", "kg"] as const;
/** Estados de subida de una foto. */
export const UPLOAD_STATUS = ["pending", "uploaded"] as const;
/** Tipos de aviso. */
export const ALERT_KINDS = ["frost", "excess_rain", "drought", "fire", "pest_threshold", "water_low", "heat_stress", "rust_risk", "senacsa"] as const;
/** Severidades de un aviso. */
export const ALERT_SEVERITIES = ["info", "watch", "warning"] as const;
/** Con MET Norway no hay ensemble: probabilidad cualitativa. */
export const ALERT_PROBABILITIES = ["low", "medium", "high"] as const;
/** Estados de un pedido de cambio de plan (lo aprueba el panel interno; no hay cobro automático). */
export const PLAN_REQUEST_STATUS = ["pending", "approved", "rejected", "cancelled"] as const;
/** Planes que el dueño puede pedir desde la web. */
export const REQUESTABLE_PLANS = ["active"] as const;
/** Pasos del embudo de activación. Los escribe el servidor, una sola vez por organización. */
export const FUNNEL_EVENTS = ["signup", "farm_created", "plots_created", "member_added", "first_record"] as const;
/** Índices de vegetación que calcula el job de Sentinel-2. */
export const INDEX_KINDS = ["ndvi", "ndre", "ndmi", "evi"] as const;
/** Índice de vegetación. */
export type IndexKind = (typeof INDEX_KINDS)[number];
/** Mapas de fertilidad interpolados (pH, fósforo, potasio, materia orgánica) a partir de análisis de suelo con punto. */
export const FERT_LAYERS = ["fert_ph", "fert_p", "fert_k", "fert_om"] as const;
/** Capa de fertilidad. */
export type FertLayer = (typeof FERT_LAYERS)[number];
/** Todas las capas de mapa de una estancia. */
export const LAYERS = ["true_color", ...INDEX_KINDS, ...FERT_LAYERS] as const;
/** Capas propias (imagen georreferenciada) de una estancia. */
export const CUSTOM_LAYER_KINDS = ["image", "geotiff"] as const;
/** Estados del procesamiento de una capa propia. */
export const CUSTOM_LAYER_STATUSES = ["processing", "ready", "failed"] as const;
/** Estado del procesamiento satelital inicial de una estancia. */
export const IMAGERY_STATUSES = ["pending", "processing", "ready", "failed"] as const;
