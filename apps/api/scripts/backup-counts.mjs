#!/usr/bin/env node
/**
 * Cuenta las filas de las tablas principales de D1 y las guarda en un JSON, para que la verificación del backup (P-05)
 * compare contra lo que había al exportar. Son SELECT de solo lectura (nada se modifica).
 *
 * Uso: node scripts/backup-counts.mjs salida.json [--local]
 *   sin --local consulta producción (--remote) con CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID.
 *
 * Solo cuenta tablas de negocio (no las de caché ni de auditoría que crecen solas): D1 gratis lee hasta 5 millones de
 * filas por día y un conteo de tabla lee cada fila.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const COUNT_TABLES = [
  "organizations",
  "users",
  "memberships",
  "farms",
  "plots",
  "points_of_interest",
  "records",
  "attachments",
  "tasks",
  "comments",
  "seasons",
  "products",
  "animals",
  "cost_entries",
];

/** Una sola fila con una columna por tabla (D1 no admite más de unos pocos UNION ALL en una consulta). */
export const countsSql = (tables = COUNT_TABLES) =>
  `SELECT ${tables.map((t) => `(SELECT count(*) FROM "${t}") AS "${t}"`).join(", ")}`;

/** Salida de `wrangler d1 execute --json`: [{ results: [{ tabla: n, ... }], success }]. Devuelve { tabla: n }. */
export function parseCounts(output) {
  const parsed = typeof output === "string" ? JSON.parse(output) : output;
  const row = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((r) => r.results ?? [])[0];
  if (!row) throw new Error("D1 no devolvió conteos");
  return Object.fromEntries(Object.entries(row).map(([t, n]) => [t, Number(n)]));
}

function main() {
  const [out, flag] = process.argv.slice(2);
  if (!out) {
    console.error("Uso: node scripts/backup-counts.mjs salida.json [--local]");
    process.exit(2);
  }
  const raw = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "yvy", flag === "--local" ? "--local" : "--remote", "--json", "--command", countsSql()],
    { encoding: "utf8", maxBuffer: 10_000_000 },
  );
  // wrangler puede escribir avisos antes del JSON
  const counts = parseCounts(raw.slice(raw.indexOf("[")));
  writeFileSync(out, JSON.stringify({ takenAt: new Date().toISOString(), counts }, null, 2));
  for (const [t, n] of Object.entries(counts)) console.log(`${t.padEnd(24)} ${n}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
