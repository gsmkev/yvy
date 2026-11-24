/** Identidad: organizaciones, usuarios, membresías, dispositivos y credenciales de la autenticación propia. */

import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { ROLES, MEMBERSHIP_STATUS } from "./enums";
import { timestamps } from "./columns";

// ---------- Identidad y organización ----------

/** Organizaciones (cuentas de clientes) con su plan y topes. */
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country").notNull().default("PY"),
  plan: text("plan").notNull().default("trial"),
  trialEndsAt: integer("trial_ends_at"),
  /** Topes propios de la organización; null = los del plan (LIMITS.plans). */
  maxHa: real("max_ha"),
  maxUsers: integer("max_users"),
  /** Código de referido con el que se registró la organización (`?ref=`), tal cual llegó si tiene forma válida. */
  referredBy: text("referred_by"),
  /** Agrónomo dueño del código, si se pudo identificar. */
  referrerUserId: text("referrer_user_id"),
  /** El equipo anotó el crédito del referido (cuando la organización referida pasó a pagar). null = sin anotar. */
  referralCreditedAt: integer("referral_credited_at"),
  /** El dueño exige segundo factor (TOTP) a los administradores de la organización. */
  requireAdminTotp: integer("require_admin_totp", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Equivale a `profiles` (no hay auth.users: la auth es propia). */
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

/** Pertenencia de un usuario a una organización con su rol. */
export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    status: text("status", { enum: MEMBERSHIP_STATUS }).notNull().default("active"),
    /** Sube cada vez que cambian los lotes asignados: el cliente rehace sus tablas. */
    assignmentsVersion: integer("assignments_version").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("memberships_org_user_uq").on(t.organizationId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

/** Dispositivos de un usuario, con el token de notificaciones push. */
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

// ---------- Auth propia ----------

/** Códigos de ingreso enviados por correo; solo se guarda su hash. */
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
 * PIN de ingreso de un empleado. Solo existe el hash (SHA-256 con sal propia y el secreto del servidor como
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

/** Tokens de refresco de sesión; solo se guarda su hash. */
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
