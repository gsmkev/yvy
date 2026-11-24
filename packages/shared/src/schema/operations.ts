import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { FARM_ACCESS_LEVELS } from "./enums";

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

/**
 * Pedidos del informe gratis de riesgo climático desde la landing (V-04). No es de una organización ni se sincroniza.
 * El email se guarda solo para mandar el informe (consentimiento explícito en `consentAt`) y se borra pasado
 * LIMITS.leads.retentionMs. La IP se guarda como hash para el tope por conexión. El enlace del informe se deriva de
 * `id` con HMAC; no se guarda.
 */
export const leads = sqliteTable(
  "leads",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    lon: real("lon").notNull(),
    lat: real("lat").notNull(),
    consentAt: integer("consent_at").notNull(),
    consentVersion: text("consent_version").notNull(),
    ipHash: text("ip_hash"),
    /** pending (esperando al job), ready (informe calculado, email sin enviar) o sent. */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    /** JSON validado con farmRiskSchema. */
    report: text("report"),
    reportAt: integer("report_at"),
    sentAt: integer("sent_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("leads_ip_idx").on(t.ipHash, t.createdAt),
    index("leads_email_idx").on(t.email, t.createdAt),
    index("leads_status_idx").on(t.status, t.createdAt),
  ],
);

/**
 * Pedidos de prueba desde la landing (formulario del cierre). No son de una organización ni se sincronizan: el equipo de Yvy
 * los ve en el panel interno y escribe por WhatsApp. El teléfono se guarda solo para eso (consentimiento en `consentAt`) y se
 * borra pasado LIMITS.trialRequests.retentionMs. La IP se guarda como hash para el tope por conexión.
 */
export const trialRequests = sqliteTable(
  "trial_requests",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** Solo dígitos, con código de país (595...). */
    whatsapp: text("whatsapp").notNull(),
    company: text("company"),
    /** JSON con la lista de cultivos o rubros elegidos. */
    crops: text("crops").notNull().default("[]"),
    hectares: real("hectares"),
    employees: integer("employees"),
    department: text("department"),
    consentAt: integer("consent_at").notNull(),
    consentVersion: text("consent_version").notNull(),
    ipHash: text("ip_hash"),
    /** new (sin atender) o contacted (el equipo ya escribió). */
    status: text("status").notNull().default("new"),
    createdAt: integer("created_at").notNull(),
    contactedAt: integer("contacted_at"),
  },
  (t) => [
    index("trial_requests_ip_idx").on(t.ipHash, t.createdAt),
    index("trial_requests_status_idx").on(t.status, t.createdAt),
  ],
);

export const userTotp = sqliteTable("user_totp", {
  userId: text("user_id").primaryKey(),
  secretEnc: text("secret_enc").notNull(),
  enabledAt: integer("enabled_at"),
  lastStep: integer("last_step").notNull().default(0),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: integer("locked_until"),
  createdAt: integer("created_at").notNull(),
});

/** P-08: códigos de recuperación de un solo uso; solo queda el SHA-256. */
export const totpRecoveryCodes = sqliteTable(
  "totp_recovery_codes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    codeHash: text("code_hash").notNull(),
    usedAt: integer("used_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("totp_recovery_user_idx").on(t.userId), uniqueIndex("totp_recovery_hash_uq").on(t.codeHash)],
);

/**
 * I-02: URLs a las que la organización pide que le avisen. El secreto de firma va cifrado (AES-GCM) porque el
 * Worker tiene que usarlo para firmar cada envío. `events` es un arreglo JSON de WEBHOOK_EVENTS.
 */
export const webhookEndpoints = sqliteTable(
  "webhook_endpoints",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    url: text("url").notNull(),
    secretEnc: text("secret_enc").notNull(),
    events: text("events").notNull().default("[]"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    /** Último intento: 'ok' o 'error' (null = todavía sin envíos). */
    lastStatus: text("last_status", { enum: ["ok", "error"] }),
    lastHttpStatus: integer("last_http_status"),
    lastError: text("last_error"),
    lastAttemptAt: integer("last_attempt_at"),
    lastSuccessAt: integer("last_success_at"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [index("webhook_endpoints_org_idx").on(t.organizationId)],
);

/**
 * I-02: buzón de eventos de aviso nuevo. Se escribe en el mismo batch que el aviso (solo si la organización tiene
 * un webhook que lo pide) y el cron de 15 minutos lo pasa a la cola y lo vacía. No se sincroniza.
 */
export const webhookOutbox = sqliteTable(
  "webhook_outbox",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    event: text("event").notNull(),
    payload: text("payload").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("webhook_outbox_created_idx").on(t.createdAt)],
);

/**
 * I-04: enlace secreto del calendario de tareas (.ics) de un usuario en una organización. Solo se guarda el SHA-256
 * del token. Hay a lo sumo uno vigente por usuario y organización; regenerarlo revoca el anterior. No se sincroniza.
 */
export const calendarFeeds = sqliteTable(
  "calendar_feeds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: integer("created_at").notNull(),
    lastUsedAt: integer("last_used_at"),
    revokedAt: integer("revoked_at"),
  },
  (t) => [uniqueIndex("calendar_feeds_hash_uq").on(t.tokenHash), index("calendar_feeds_user_idx").on(t.userId, t.organizationId)],
);

/**
 * P-04: última corrida de cada job de datos (sentinel2, chirps, firms), anotada por /ingest en cada pedido firmado.
 * Alimenta la página pública de estado; no guarda nada de clientes. No se sincroniza.
 */
export const jobRuns = sqliteTable("job_runs", {
  job: text("job").primaryKey(),
  lastOkAt: integer("last_ok_at"),
  lastFailAt: integer("last_fail_at"),
  lastFailStatus: integer("last_fail_status"),
});

/**
 * X-26: dosis habitual de un producto por hectárea, en la unidad base del producto (l o kg). La carga la organización;
 * una aplicación fuera de este rango aparece en "Para revisar". Tabla de oficina: no se sincroniza.
 */
export const productDoseRanges = sqliteTable("product_dose_ranges", {
  productId: text("product_id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  minDose: real("min_dose"),
  maxDose: real("max_dose"),
  updatedAt: integer("updated_at").notNull(),
});

/** X-26: "Está bien" sobre un registro marcado. Vale hasta que el registro se edite (updated_at posterior). */
export const recordReviews = sqliteTable("record_reviews", {
  recordId: text("record_id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  reviewedBy: text("reviewed_by").notNull(),
  reviewedAt: integer("reviewed_at").notNull(),
});
