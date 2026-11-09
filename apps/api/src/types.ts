import type { AuthCtx, ScopedDb } from "./db/scoped";

export interface Secrets {
  JWT_SECRET: string;
  INGEST_SECRET: string;
  RESEND_API_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}

export type Bindings = Env & Secrets;

export type AppEnv = {
  Bindings: Bindings;
  Variables: { auth: AuthCtx; sdb: ScopedDb };
};

/** Mensajes de la cola de trabajos: una estancia por mensaje (PRD-cloudflare §4.8). */
export type JobMessage =
  | { type: "forecast"; farmId: string }
  | { type: "drought"; farmId: string }
  | { type: "weekly_report"; farmId: string };
