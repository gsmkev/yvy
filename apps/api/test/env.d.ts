/** Tipos del entorno de pruebas: agrega las migraciones de D1 a los bindings del Worker. */
import type { D1Migration } from "@cloudflare/vitest-plugin";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      JWT_SECRET: string;
      INGEST_SECRET: string;
      RESEND_API_KEY: string;
      R2_ACCOUNT_ID: string;
      R2_ACCESS_KEY_ID: string;
      R2_SECRET_ACCESS_KEY: string;
    }
  }
}
