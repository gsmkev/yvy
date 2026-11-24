/** Sincronización: migración, kv, y el contrato SyncStore (outbox, cursores, aplicar el pull) más el cierre de sesión. */
import { type Cursor, type Mutation, type PullTable, type RejectReason } from "@yvy/shared";
import { SERVER_SCHEMA } from "../schema-sql";
import { LOCAL_SCHEMA, type Param } from "../sql";
import { type Ctx, TABLES, COLS } from "./core";

/** Incremental: user_version guarda cuántas sentencias del esquema del servidor ya se aplicaron. */
export function migrate(db: Ctx): void {
  const applied = db.sql.get<{ user_version: number }>("PRAGMA user_version")?.user_version ?? 0;
  db.sql.tx(() => {
    for (const stmt of SERVER_SCHEMA.slice(applied)) db.sql.run(stmt);
    for (const stmt of LOCAL_SCHEMA) db.sql.run(stmt);
    if (SERVER_SCHEMA.length > applied) db.sql.run(`PRAGMA user_version = ${SERVER_SCHEMA.length}`);
  });
}

export function getKv(db: Ctx, key: string): string | null {
  return db.sql.get<{ value: string }>("SELECT value FROM kv WHERE key = ?", [key])?.value ?? null;
}

export function setKv(db: Ctx, key: string, value: string | null): void {
  if (value === null) db.sql.run("DELETE FROM kv WHERE key = ?", [key]);
  else
    db.sql.run("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
      key,
      value,
    ]);
}

export async function pendingMutations(db: Ctx, limit: number): Promise<Mutation[]> {
  return db.sql
    .all<{ payload: string }>(
      "SELECT payload FROM outbox WHERE rejected_reason IS NULL ORDER BY mutation_id LIMIT ?",
      [limit],
    )
    .map((r) => JSON.parse(r.payload) as Mutation);
}

export async function removeMutations(db: Ctx, ids: string[]): Promise<void> {
  db.sql.tx(() => {
    for (const id of ids) db.sql.run("DELETE FROM outbox WHERE mutation_id = ?", [id]);
  });
}

export async function markRejected(db: Ctx, rejections: { mutationId: string; reason: RejectReason; detail?: string }[]): Promise<void> {
  db.sql.tx(() => {
    for (const r of rejections)
      db.sql.run("UPDATE outbox SET rejected_reason = ?, rejected_detail = ? WHERE mutation_id = ?", [
        r.reason,
        r.detail ?? null,
        r.mutationId,
      ]);
  });
}

export async function getCursor(db: Ctx, table: PullTable): Promise<Cursor | null> {
  const c = db.sql.get<{ version: number; id: string }>("SELECT version, id FROM sync_cursors WHERE tbl = ?", [
    table,
  ]);
  return c ? { version: c.version, id: c.id } : null;
}

export async function applyPull(db: Ctx, table: PullTable, rows: Record<string, unknown>[], cursor: Cursor | null): Promise<void> {
  const cols = COLS[table];
  const names = cols.map((c) => c.name);
  const insert = `INSERT INTO ${table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})
    ON CONFLICT(id) DO UPDATE SET ${names
      .filter((n) => n !== "id")
      .map((n) => `${n} = excluded.${n}`)
      .join(", ")}`;
  db.sql.tx(() => {
    for (const row of rows) {
      if (hasPending(db, String(row.id))) continue;
      db.sql.run(
        insert,
        cols.map((c) => (row[c.key] === undefined ? null : typeof row[c.key] === "boolean" ? (row[c.key] ? 1 : 0) : (row[c.key] as Param))),
      );
    }
    if (cursor) {
      db.sql.run(
        "INSERT INTO sync_cursors (tbl, version, id) VALUES (?, ?, ?) ON CONFLICT(tbl) DO UPDATE SET version = excluded.version, id = excluded.id",
        [table, cursor.version, cursor.id],
      );
    }
  });
}

export async function getAssignmentsVersion(db: Ctx): Promise<number | null> {
  const v = getKv(db, "assignments_version");
  return v === null ? null : Number(v);
}

export async function setAssignmentsVersion(db: Ctx, v: number): Promise<void> {
  setKv(db, "assignments_version", String(v));
}

export async function resetTables(db: Ctx, tables: readonly PullTable[]): Promise<void> {
  db.sql.tx(() => {
    for (const t of tables) {
      db.sql.run(`DELETE FROM ${t} WHERE id NOT IN (SELECT row_id FROM outbox)`);
      db.sql.run("DELETE FROM sync_cursors WHERE tbl = ?", [t]);
    }
  });
}

export function hasPending(db: Ctx, rowId: string): boolean {
  return !!db.sql.get("SELECT 1 FROM outbox WHERE row_id = ? AND rejected_reason IS NULL LIMIT 1", [rowId]);
}

/** Cierra la sesión: borra todo lo local salvo lo que no se subió (no se pierde nada). */
export function wipeSynced(db: Ctx): void {
  db.sql.tx(() => {
    for (const t of Object.keys(TABLES)) db.sql.run(`DELETE FROM ${t} WHERE id NOT IN (SELECT row_id FROM outbox)`);
    db.sql.run("DELETE FROM sync_cursors");
    db.sql.run("DELETE FROM kv WHERE key = 'assignments_version'");
    db.sql.run("DELETE FROM http_cache"); // lecturas en línea de oficina (src/office): son de este usuario y organización
  });
}
