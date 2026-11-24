/**
 * Tipos del Worker: bindings de Cloudflare, secretos opcionales, variables de Hono y mensajes de la cola.
 */
import type { AuthCtx, ScopedDb } from "./db/scoped";

interface Secrets {
  JWT_SECRET: string;
  INGEST_SECRET: string;
  RESEND_API_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  /** Opcionales: sin ellos no se disparan los jobs al crear estancias. */
  GITHUB_DISPATCH_TOKEN?: string;
  GITHUB_REPO?: string;
  /** Opcional : sin DSN no se manda nada a Sentry. */
  SENTRY_DSN?: string;
  /** Opcional : meses tras los cuales los registros y estadísticas se archivan en R2 (mínimo 3). Vacío = no archiva. */
  ARCHIVE_AFTER_MONTHS?: string;
  /** Opcionales : ingreso con Google. Sin ellos el botón no aparece. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

/** Demo pública: sin estos dos valores POST /auth/demo responde 404 y la landing oculta el botón. */
interface DemoConfig {
  DEMO_ORG_ID?: string;
  DEMO_USER_ID?: string;
}

/** Bindings de Cloudflare (D1, R2, cola, assets) más secretos y configuración de la demo. */
export type Bindings = Env & Secrets & DemoConfig;

/** Entorno de Hono: bindings y variables que cargan los middlewares (`auth` y `sdb`). */
export type AppEnv = {
  Bindings: Bindings;
  Variables: { auth: AuthCtx; sdb: ScopedDb };
};

/** Mensajes de la cola de trabajos: una estancia por mensaje. */
export type JobMessage =
  | { type: "forecast"; farmId: string }
  | { type: "drought"; farmId: string }
  | { type: "weekly_report"; farmId: string }
  | { type: "pest"; farmId: string }
  /** Recordatorios de las campañas oficiales de SENACSA. */
  | { type: "senacsa"; farmId: string }
  /** Comparación anónima con la zona. */
  | { type: "benchmark"; farmId: string }
  /** Pronóstico de un lote de una estancia grande (un mensaje por lote para no pasar los límites de subrequests). */
  | { type: "plot_forecast"; farmId: string; plotId: string }
  /** Una entrega de webhook (el cuerpo ya viene armado y se firma al enviar). */
  | { type: "webhook"; endpointId: string; payload: string };
