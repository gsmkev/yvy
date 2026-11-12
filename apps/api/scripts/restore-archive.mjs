#!/usr/bin/env node
/**
 * P-06: vuelve a cargar en D1 los datos archivados en R2 (archive/<tabla>/AAAA-MM/*.ndjson). Genera SQL: no toca ninguna
 * base. Las filas se insertan con INSERT OR IGNORE (si el id ya existe no se pisa) y con una versión de sync nueva, así
 * los celulares las vuelven a bajar.
 *
 * Uso:
 *   wrangler r2 object get yvy-media/archive/records/2025-01/<archivo>.ndjson --remote --file registros-2025-01.ndjson
 *   node scripts/restore-archive.mjs registros-2025-01.ndjson [otro.ndjson ...] > restaurar.sql
 *   pnpm wrangler d1 execute yvy --remote --file restaurar.sql     (o --local para probar)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Tablas que se archivan y que este script sabe restaurar (nombre → tiene columna `version`). */
export const TABLES = { records: true, attachments: true, comments: true, plot_index_stats: true };
const IDENT = /^[a-z_][a-z0-9_]*$/;

export const literal = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`número inválido: ${v}`);
    return String(v);
  }
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replaceAll("'", "''")}'`;
};

/** Convierte el texto NDJSON de un archivo del archivo en sentencias INSERT OR IGNORE. */
export function ndjsonToSql(text) {
  const out = [];
  for (const [i, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      throw new Error(`línea ${i + 1}: JSON inválido`);
    }
    if (!(rec.t in TABLES)) throw new Error(`línea ${i + 1}: tabla desconocida "${rec.t}"`);
    const cols = Object.keys(rec.row);
    if (!cols.length || !cols.every((c) => IDENT.test(c))) throw new Error(`línea ${i + 1}: columnas inválidas`);
    const values = cols.map((c) => (c === "version" ? "(SELECT v FROM sync_seq WHERE id = 1)" : literal(rec.row[c])));
    out.push(`INSERT OR IGNORE INTO ${rec.t} (${cols.join(", ")}) VALUES (${values.join(", ")});`);
  }
  return out;
}

export function buildRestoreSql(texts) {
  const body = texts.flatMap(ndjsonToSql);
  if (!body.length) return "";
  // una versión nueva para todo lo restaurado (debe ir antes de los INSERT que la leen)
  return ["INSERT INTO sync_seq (id, v) VALUES (1, 1) ON CONFLICT(id) DO UPDATE SET v = v + 1;", ...body].join("\n") + "\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("Uso: node scripts/restore-archive.mjs archivo.ndjson [...] > restaurar.sql");
    process.exit(1);
  }
  try {
    process.stdout.write(buildRestoreSql(files.map((f) => readFileSync(f, "utf8"))));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
