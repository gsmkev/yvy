import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS_DIR, readBackup, restoreAndVerify } from "./restore-backup.mjs";

/** Una copia como la de `wrangler d1 export`: PRAGMA, el esquema de las migraciones y los datos. */
const schema = (omit) =>
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .flatMap((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8").split("--> statement-breakpoint"))
    .map((s) => s.trim())
    .filter((x) => x && !(omit && omit.test(x)))
    .join("\n");

const data = (limits = true) => `
INSERT INTO "organizations" ("id","name","country","plan","trial_ends_at",${limits ? '"max_ha","max_users",' : ""}"created_at","updated_at") VALUES ('o1','Estancia Test','PY','trial',NULL,${limits ? "NULL,NULL," : ""}1,1);
INSERT INTO "users" ("id","email","full_name","phone","locale","created_at","updated_at") VALUES ('u1','dueno@test.py','Dueño',NULL,'es-PY',1,1);
INSERT INTO "memberships" ("id","organization_id","user_id","role","status","assignments_version","created_at","updated_at","deleted_at") VALUES ('m1','o1','u1','owner','active',0,1,1,NULL);
`;
const backup = (extra = "", { omit, limits = true } = {}) =>
  `PRAGMA defer_foreign_keys=TRUE;\n${schema(omit)}\n${data(limits)}\n${extra}`;

test("una copia completa se restaura y cuenta las filas", () => {
  const r = restoreAndVerify(backup());
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(r.counts.organizations, 1);
  assert.equal(r.counts.users, 1);
  assert.equal(r.counts.memberships, 1);
  assert.equal(r.counts.farms, 0);
});

test("restaura en un archivo y se puede abrir después", () => {
  const dir = mkdtempSync(join(tmpdir(), "yvy-test-"));
  const dbPath = join(dir, "r.sqlite");
  assert.equal(restoreAndVerify(backup(), { dbPath }).ok, true);
  const db = new DatabaseSync(dbPath);
  assert.equal(db.prepare("SELECT name FROM organizations").get().name, "Estancia Test");
  db.close();
});

test("lee copias comprimidas (.sql.gz)", () => {
  const dir = mkdtempSync(join(tmpdir(), "yvy-test-"));
  const file = join(dir, "yvy-2026-11-08.sql.gz");
  writeFileSync(file, gzipSync(backup()));
  assert.equal(restoreAndVerify(readBackup(file)).ok, true);
});

test("falla si falta una tabla del esquema", () => {
  const r = restoreAndVerify(backup("", { omit: /`tasks`/ }));
  assert.equal(r.ok, false);
  assert.match(r.errors.join("\n"), /Falta la tabla tasks/);
});

test("falla si a una tabla le faltan columnas (copia de un esquema viejo)", () => {
  const r = restoreAndVerify(backup("", { omit: /ADD `max_ha`/, limits: false }));
  assert.equal(r.ok, false);
  assert.match(r.errors.join("\n"), /organizations no tiene las columnas: max_ha/);
});

test("falla si las tablas clave están vacías", () => {
  const r = restoreAndVerify(`${schema()}\n`);
  assert.equal(r.ok, false);
  assert.match(r.errors.join("\n"), /organizations tiene 0 filas/);
});

test("--min-rows exige un mínimo por tabla", () => {
  const r = restoreAndVerify(backup(), { minRows: { farms: 3 } });
  assert.equal(r.ok, false);
  assert.match(r.errors.join("\n"), /farms tiene 0 filas y se esperaban al menos 3/);
});

test("SQL corrupto: no lanza, informa el error", () => {
  const r = restoreAndVerify("INSERT INTO nada VALUES (1);");
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /No se pudo restaurar/);
});

test("avisa de tablas que el repo no conoce, sin fallar", () => {
  const r = restoreAndVerify(backup('CREATE TABLE "rara" (id integer);'));
  assert.equal(r.ok, true);
  assert.match(r.warnings.join("\n"), /rara/);
});
