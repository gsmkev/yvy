import type { AuthCtx, ScopedDb } from "./db/scoped";

export interface Secrets {
  JWT_SECRET: string;
  INGEST_SECRET: string;
  RESEND_API_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  /** Opcionales: sin ellos no se disparan los jobs al crear estancias (docs/DEPLOY.md). */
  GITHUB_DISPATCH_TOKEN?: string;
  GITHUB_REPO?: string;
  /** Opcional (P-02): sin DSN no se manda nada a Sentry. */
  SENTRY_DSN?: string;
  /** Opcional (P-06): meses tras los cuales los registros y estadísticas se archivan en R2 (mínimo 3). Vacío = no archiva. */
  ARCHIVE_AFTER_MONTHS?: string;
  /** Opcionales (P-07): ingreso con Google. Sin ellos el botón no aparece. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

/** Demo pública (V-02): sin estos dos valores POST /auth/demo responde 404 y la landing oculta el botón. */
export interface DemoConfig {
  DEMO_ORG_ID?: string;
  DEMO_USER_ID?: string;
}

export type Bindings = Env & Secrets & DemoConfig;

export type AppEnv = {
  Bindings: Bindings;
  Variables: { auth: AuthCtx; sdb: ScopedDb };
};

/** Mensajes de la cola de trabajos: una estancia por mensaje (PRD-cloudflare §4.8). */
export type JobMessage =
  | { type: "forecast"; farmId: string }
  | { type: "drought"; farmId: string }
  | { type: "weekly_report"; farmId: string }
  | { type: "pest"; farmId: string }
  /** R-08: comparación anónima con la zona. */
  | { type: "benchmark"; farmId: string }
  /** C-03: pronóstico de un lote de una estancia grande (un mensaje por lote para no pasar los límites de subrequests). */
  | { type: "plot_forecast"; farmId: string; plotId: string }
  /** I-02: una entrega de webhook (el cuerpo ya viene armado y se firma al enviar). */
  | { type: "webhook"; endpointId: string; payload: string };
