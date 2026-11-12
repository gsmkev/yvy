import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS_DIR } from "./restore-backup.mjs";
import { buildRestoreSql, literal, ndjsonToSql } from "./restore-archive.mjs";

const db = () => {
  const d = new DatabaseSync(":memory:");
  for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith(".sql")).sort())
    for (const s of readFileSync(join(MIGRATIONS_DIR, f), "utf8").split("--> statement-breakpoint")) if (s.trim()) d.exec(s);
  return d;
};
const record = (id, extra = {}) => ({
  id, organization_id: "o1", farm_id: "f1", plot_id: null, poi_id: null, author_id: "u1", kind: "rain",
  data: `{"mm":5,"nota":"l'agua"}`, schema_version: 1, lon: null, lat: null, gps_accuracy_m: null,
  captured_at: 1700000000000, device_id: null, created_at: 1, updated_at: 1, deleted_at: null, version: 7, ...extra,
});

test("escapa texto y rechaza lo que no es una tabla de datos", () => {
  assert.equal(literal("l'agua"), "'l''agua'");
  assert.equal(literal(null), "NULL");
  assert.throws(() => ndjsonToSql('{"t":"users","row":{"id":"x"}}'), /tabla desconocida/);
  assert.throws(() => ndjsonToSql('{"t":"records","row":{"id; DROP TABLE x":"x"}}'), /columnas inválidas/);
  assert.throws(() => ndjsonToSql("no es json"), /JSON inválido/);
});

test("restaura registros y adjuntos en una base con el esquema real, sin pisar existentes y con versión nueva", () => {
  const d = db();
  d.exec("INSERT INTO sync_seq (id, v) VALUES (1, 41)");
  d.exec(`INSERT INTO records (id, organization_id, farm_id, author_id, kind, data, schema_version, captured_at, created_at, updated_at, version) VALUES ('r2','o1','f1','u1','rain','{}',1,1,1,1,3)`);
  const lines = [
    { t: "records", row: record("r1") },
    { t: "records", row: record("r2") },
    { t: "attachments", row: { id: "a1", organization_id: "o1", record_id: "r1", storage_path: "p", thumb_path: "t", mime: "image/webp", width: null, height: null, bytes: 10, upload_status: "uploaded", created_at: 1, updated_at: 1, deleted_at: null, version: 7 } },
  ].map((l) => JSON.stringify(l)).join("\n");
  d.exec(buildRestoreSql([lines + "\n"]));
  assert.equal(d.prepare("SELECT count(*) n FROM records").get().n, 2);
  const r1 = d.prepare("SELECT data, version FROM records WHERE id='r1'").get();
  assert.equal(JSON.parse(r1.data).nota, "l'agua");
  assert.equal(r1.version, 42); // versión nueva: los celulares lo vuelven a bajar
  assert.equal(d.prepare("SELECT version FROM records WHERE id='r2'").get().version, 3); // el existente no se pisa
  assert.equal(d.prepare("SELECT count(*) n FROM attachments").get().n, 1);
});

test("sin filas no genera SQL", () => assert.equal(buildRestoreSql(["\n"]), ""));
