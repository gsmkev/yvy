#!/usr/bin/env node
/**
 * Restaura una copia de D1 (SQL de `wrangler d1 export`, sin comprimir o .gz) en una base SQLite local y la
 * verifica contra el esquema de las migraciones del repo (P-05). Sin dependencias: usa node:sqlite (Node 22+).
 *
 * Uso:
 *   node scripts/restore-backup.mjs yvy-2026-11-08.sql.gz [--db restaurada.sqlite] [--min-rows tabla=n ...]
 *   node scripts/restore-backup.mjs --latest [--bucket yvy-media] [--db restaurada.sqlite]
 *
 * --latest baja la copia más reciente de R2 (yvy-media/backups/yvy-AAAA-MM-DD.sql.gz, de los últimos 10 días) con
 * wrangler; necesita CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID.
 * Con --counts conteos.json (lo escribe scripts/backup-counts.mjs al exportar) compara las filas restauradas con las que
 * tenía D1 al exportar: si en una tabla faltan más filas que la tolerancia (2 %, mínimo 5), la copia perdió datos.
 * Con --latest baja también el yvy-AAAA-MM-DD.counts.json de ese día, si existe.
 * Sale con código 1 si la restauración falla, falta una tabla o columna, una tabla clave está vacía o los conteos no cierran.
 * Para cargarla en el D1 local de `wrangler dev`: pnpm --filter api exec wrangler d1 execute yvy --local --file <copia.sql>
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

const HERE = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = resolve(HERE, "../migrations");

/** Tablas que deben tener filas en una base real: si están vacías, la copia no sirve. */
export const KEY_TABLES = ["organizations", "users", "memberships"];
/** Tablas internas de D1/SQLite que no son del esquema de Yvy. */
const INTERNAL = /^(sqlite_|_cf_|d1_migrations$)/;

/** Esquema de referencia: aplica las migraciones del repo en una base en memoria. */
export function referenceSchema(dir = MIGRATIONS_DIR) {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) db.exec(stmt);
    }
  }
  return tableColumns(db);
}

/** { tabla: [columnas] } sin las tablas internas. */
export function tableColumns(db) {
  const out = {};
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  for (const { name } of tables) {
    if (INTERNAL.test(name)) continue;
    out[name] = db.prepare(`PRAGMA table_info("${name}")`).all().map((c) => c.name);
  }
  return out;
}

export function readBackup(file) {
  const raw = readFileSync(file);
  return (file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8");
}

/**
 * Restaura el SQL en `dbPath` (en memoria por defecto) y lo verifica.
 * Devuelve { ok, errors, warnings, counts }; nunca lanza por una copia mala.
 */
/**
 * Compara las filas restauradas con las que tenía D1 al exportar. Los conteos se toman justo antes de exportar, así que
 * la copia puede tener algunas filas de más (lo que se escribió en el medio) pero no de menos: falla si en una tabla
 * faltan más filas que `max(minTolerance, pct % de lo registrado)`.
 */
export function compareCounts(restored, recorded, { pct = 2, minTolerance = 5 } = {}) {
  const errors = [];
  for (const [table, n] of Object.entries(recorded)) {
    if (restored[table] === undefined) {
      errors.push(`La copia no tiene la tabla ${table}, que tenía ${n} filas en D1`);
      continue;
    }
    const tolerance = Math.max(minTolerance, Math.ceil((n * pct) / 100));
    if (restored[table] < n - tolerance)
      errors.push(`La tabla ${table} tiene ${restored[table]} filas en la copia y D1 tenía ${n} al exportar (tolerancia ${tolerance})`);
  }
  return errors;
}

export function restoreAndVerify(sql, { dbPath = ":memory:", minRows = {}, expectedCounts = null, referenceDir = MIGRATIONS_DIR } = {}) {
  const errors = [];
  const warnings = [];
  let counts = {};
  const db = new DatabaseSync(dbPath);
  try {
    try {
      db.exec(sql);
    } catch (e) {
      return { ok: false, errors: [`No se pudo restaurar el SQL: ${e.message}`], warnings, counts };
    }
    const ref = referenceSchema(referenceDir);
    const got = tableColumns(db);
    for (const [table, cols] of Object.entries(ref)) {
      if (!got[table]) {
        errors.push(`Falta la tabla ${table}`);
        continue;
      }
      const missing = cols.filter((c) => !got[table].includes(c));
      if (missing.length) errors.push(`La tabla ${table} no tiene las columnas: ${missing.join(", ")}`);
    }
    for (const table of Object.keys(got)) if (!ref[table]) warnings.push(`Tabla que el repo no conoce: ${table}`);
    for (const table of Object.keys(ref)) {
      if (!got[table]) continue;
      counts[table] = Number(db.prepare(`SELECT count(*) AS n FROM "${table}"`).get().n);
    }
    const needed = { ...Object.fromEntries(KEY_TABLES.map((t) => [t, 1])), ...minRows };
    for (const [table, min] of Object.entries(needed)) {
      if (counts[table] === undefined) {
        if (got[table] === undefined && ref[table]) continue; // ya informada como tabla faltante
        errors.push(`No se puede contar ${table}`);
      } else if (counts[table] < min) {
        errors.push(`La tabla ${table} tiene ${counts[table]} filas y se esperaban al menos ${min}`);
      }
    }
    if (expectedCounts) errors.push(...compareCounts(counts, expectedCounts));
    const integrity = db.prepare("PRAGMA integrity_check").get();
    if (Object.values(integrity)[0] !== "ok") errors.push(`integrity_check: ${Object.values(integrity)[0]}`);
    return { ok: errors.length === 0, errors, warnings, counts };
  } finally {
    db.close();
  }
}

/** Baja de R2 la copia más reciente de los últimos `days` días. Devuelve la ruta local. */
export function downloadLatest({ bucket = "yvy-media", days = 10, now = new Date() } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "yvy-backup-"));
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const file = join(dir, `yvy-${d}.sql.gz`);
    try {
      execFileSync("npx", ["wrangler", "r2", "object", "get", `${bucket}/backups/yvy-${d}.sql.gz`, "--remote", "--file", file], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (existsSync(file)) {
        // los conteos de D1 al exportar viajan al lado de la copia (copias viejas no los tienen)
        try {
          execFileSync("npx", ["wrangler", "r2", "object", "get", `${bucket}/backups/yvy-${d}.counts.json`, "--remote", "--file", file.replace(/\.sql\.gz$/, ".counts.json")], {
            stdio: ["ignore", "pipe", "pipe"],
          });
        } catch {
          /* sin conteos: se verifica solo el esquema y las tablas clave */
        }
        return file;
      }
    } catch {
      /* ese día no hubo copia */
    }
  }
  rmSync(dir, { recursive: true, force: true });
  throw new Error(`No hay copias de los últimos ${days} días en ${bucket}/backups/`);
}

function parseArgs(argv) {
  const o = { minRows: {}, latest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--latest") o.latest = true;
    else if (a === "--db") o.db = argv[++i];
    else if (a === "--bucket") o.bucket = argv[++i];
    else if (a === "--counts") o.counts = argv[++i];
    else if (a === "--min-rows") {
      const [t, n] = String(argv[++i]).split("=");
      o.minRows[t] = Number(n);
    } else if (!a.startsWith("--")) o.file = a;
    else throw new Error(`Opción desconocida: ${a}`);
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.file && !o.latest) {
    console.error("Uso: node scripts/restore-backup.mjs <copia.sql[.gz]> | --latest  [--db salida.sqlite] [--min-rows tabla=n] [--counts conteos.json]");
    process.exit(2);
  }
  const file = o.latest ? downloadLatest({ bucket: o.bucket }) : o.file;
  console.log(`Copia: ${file}`);
  const countsFile = o.counts ?? (o.latest ? file.replace(/\.sql\.gz$/, ".counts.json") : null);
  const expectedCounts = countsFile && existsSync(countsFile) ? JSON.parse(readFileSync(countsFile, "utf8")).counts : null;
  if (o.counts && !expectedCounts) throw new Error(`No existe el archivo de conteos ${o.counts}`);
  if (!expectedCounts) console.log("Aviso: sin conteos de D1 para comparar (copia anterior a P-05 o sin archivo).");
  const res = restoreAndVerify(readBackup(file), { dbPath: o.db ?? ":memory:", minRows: o.minRows, expectedCounts });
  for (const w of res.warnings) console.log(`Aviso: ${w}`);
  console.log("Filas por tabla:");
  for (const [t, n] of Object.entries(res.counts)) console.log(`  ${t.padEnd(24)} ${n}`);
  if (!res.ok) {
    for (const e of res.errors) console.error(`ERROR: ${e}`);
    process.exit(1);
  }
  console.log(`Restauración verificada${expectedCounts ? " (conteos de D1 incluidos)" : ""}${o.db ? `: ${o.db}` : ""}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  });
}
