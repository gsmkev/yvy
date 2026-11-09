import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "../../packages/shared/src/schema.ts",
  out: "./migrations",
});
