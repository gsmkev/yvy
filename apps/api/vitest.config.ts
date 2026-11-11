import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            JWT_SECRET: "test-jwt-secret-0123456789abcdef",
            ADMIN_EMAILS: "staff@yvy.test",
            INGEST_SECRET: "test-ingest-secret",
            RESEND_API_KEY: "",
            R2_ACCOUNT_ID: "acct",
            R2_ACCESS_KEY_ID: "key",
            R2_SECRET_ACCESS_KEY: "secret",
          },
        },
      }),
    ],
    // scripts/*.test.mjs corre con node --test (usa node:sqlite, que no existe en workerd)
    test: { setupFiles: ["./test/apply-migrations.ts"], include: ["test/**/*.test.ts"] },
  };
});
