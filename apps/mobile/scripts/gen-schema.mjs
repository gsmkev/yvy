// Genera src/db/schema-sql.ts con las migraciones de D1: el celular usa el mismo esquema que el servidor.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = "../api/migrations";
const statements = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .flatMap((f) => readFileSync(`${dir}/${f}`, "utf8").split("--> statement-breakpoint"))
  .map((s) => s.trim())
  .filter(Boolean);
writeFileSync(
  "src/db/schema-sql.ts",
  `// Generado por scripts/gen-schema.mjs desde apps/api/migrations. No editar a mano.\nexport const SERVER_SCHEMA: string[] = ${JSON.stringify(statements, null, 2)};\n`,
);
console.log(`${statements.length} sentencias`);
