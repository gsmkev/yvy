/** Aplica las migraciones de D1 al entorno de pruebas antes de cada archivo. */
import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
