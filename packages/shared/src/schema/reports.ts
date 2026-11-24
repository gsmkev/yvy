import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
