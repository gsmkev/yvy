import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { HEALTH_REASONS } from "../livestock";
import { ALERT_KINDS, ALERT_SEVERITIES, ALERT_PROBABILITIES, PLAN_REQUEST_STATUS, REQUESTABLE_PLANS } from "./enums";
import { timestamps, synced } from "./columns";

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
  /** Sistema productivo (ADR 0005): cria, recria, invernada, ciclo_completo, feedlot o tambo. Nulo = sin elegir. */
  system: text("system"),
  /** Tipo de pastura de los potreros sin "tipo de pastura" reconocible: natural, implantada o mejorada. */
  pastureDefault: text("pasture_default"),
  /** JSON {natural?, implantada?, mejorada?}: UA/ha recomendadas propias de la estancia (vacío = las de referencia). */
  pastureLoads: text("pasture_loads"),
  /** Estación de servicio (ADR 0005): inicio "MM-DD" y días. Nulo = 11-01 y 90. */
  breedingStart: text("breeding_start"),
  breedingDays: integer("breeding_days"),
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
 * P-03: analítica propia, sin terceros y sin datos de personas. Los pasos del embudo (FUNNEL_EVENTS) se guardan una
 * vez por organización (índice único parcial); no llevan usuario.
 */
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    organizationId: text("organization_id").notNull(),
    ts: integer("ts").notNull(),
  },
  (t) => [
    index("events_name_ts_idx").on(t.name, t.ts),
    uniqueIndex("events_funnel_uq")
      .on(t.organizationId, t.name)
      .where(sql`name IN ('signup', 'farm_created', 'plots_created', 'member_added', 'first_record')`),
  ],
);

/**
 * P-03: pantallas abiertas ("view:tareas"), agrupadas por día y nombre: una fila por día y pantalla, sin usuario ni
 * organización. `n` ya viene ponderado por el muestreo (cada evento guardado suma 1 / sampleRate). Se borran a los 90 días.
 */
export const eventsDaily = sqliteTable(
  "events_daily",
  {
    day: text("day").notNull(),
    name: text("name").notNull(),
    n: integer("n").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.name] })],
);

/** U-29: preferencias de notificación por usuario (JSON validado con notificationPrefsSchema). No se sincroniza. */
export const notificationPrefs = sqliteTable("notification_prefs", {
  userId: text("user_id").primaryKey(),
  prefs: text("prefs").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * P-10: pedido de cambio de plan o de topes, hecho por el dueño desde la web. Queda pendiente hasta que el panel interno lo
 * aprueba (aplica el plan y los topes) o lo rechaza; el cobro es aparte (P-11). Un solo pedido pendiente por organización.
 */
export const planRequests = sqliteTable(
  "plan_requests",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    requestedBy: text("requested_by").notNull(),
    plan: text("plan", { enum: REQUESTABLE_PLANS }).notNull(),
    /** Topes que pide (null = los del plan). */
    maxHa: real("max_ha"),
    maxUsers: integer("max_users"),
    note: text("note"),
    status: text("status", { enum: PLAN_REQUEST_STATUS }).notNull().default("pending"),
    createdAt: integer("created_at").notNull(),
    resolvedAt: integer("resolved_at"),
    resolvedBy: text("resolved_by"),
    resolutionNote: text("resolution_note"),
  },
  (t) => [
    uniqueIndex("plan_requests_pending_uq")
      .on(t.organizationId)
      .where(sql`status = 'pending'`),
    index("plan_requests_status_idx").on(t.status, t.createdAt),
  ],
);

/** U-24: estado del recorrido de primera vez por usuario (se oculta una vez y vale en todos sus dispositivos). No se sincroniza. */
export const onboardingState = sqliteTable("onboarding_state", {
  userId: text("user_id").primaryKey(),
  /** Cuándo ocultó la guía; null = la ve mientras le falten pasos. */
  dismissedAt: integer("dismissed_at"),
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
