/**
 * ERP sencillo (ADR 0004): altas, cambios y bajas de los maestros de oficina (terceros, depósitos, tipos de cambio...).
 * Casi todas son de oficina y no se sincronizan; las que bajan al celular llevan `version`. Todo filtra por organización y usa borrado lógico.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { newId, type Role } from "@yvy/shared";
import { bumpVersion, currentVersion, runBatch, type Stmt } from "./client";
import { NotFoundError, type ScopedDb } from "./scoped";

export type ErpTable = SQLiteTable & {
  id: SQLiteColumn;
  organizationId: SQLiteColumn;
  deletedAt: SQLiteColumn;
  updatedAt: SQLiteColumn;
};

/** Las tablas que bajan al celular (products, machines) llevan `version`: bumpVersion primero en el batch. */
const isSynced = (table: ErpTable) => "version" in table;
const write = async (sdb: ScopedDb, table: ErpTable, stmt: Stmt) =>
  isSynced(table) ? runBatch(sdb.db, [bumpVersion(sdb.db), stmt]) : void (await stmt);

/** "" pasa a null y lo que no vino (undefined) se descarta: un PATCH no pisa lo que no manda. */
export const cleanRow = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v]),
  );

export async function erpList(sdb: ScopedDb, table: ErpTable, canRead: (r: Role) => boolean, order: SQLiteColumn[]) {
  sdb.require(canRead);
  return sdb.db
    .select()
    .from(table)
    .where(and(eq(table.organizationId, sdb.auth.orgId), isNull(table.deletedAt)))
    .orderBy(...order.map((c) => asc(c)));
}

export async function erpCreate(
  sdb: ScopedDb,
  table: ErpTable,
  canWrite: (r: Role) => boolean,
  values: Record<string, unknown>,
) {
  sdb.require(canWrite);
  const id = newId();
  const ts = sdb.now();
  const row = { ...cleanRow(values), id, organizationId: sdb.auth.orgId, createdAt: ts, updatedAt: ts };
  await write(sdb, table, sdb.db.insert(table).values((isSynced(table) ? { ...row, version: currentVersion } : row) as never));
  return { id };
}

export async function erpUpdate(
  sdb: ScopedDb,
  table: ErpTable,
  canWrite: (r: Role) => boolean,
  id: string,
  patch: Record<string, unknown>,
) {
  sdb.require(canWrite);
  const where = and(eq(table.id, id), eq(table.organizationId, sdb.auth.orgId), isNull(table.deletedAt));
  const [row] = await sdb.db.select({ id: table.id }).from(table).where(where).limit(1);
  if (!row) throw new NotFoundError("No existe");
  const set = { ...cleanRow(patch), updatedAt: sdb.now() };
  await write(sdb, table, sdb.db.update(table).set((isSynced(table) ? { ...set, version: currentVersion } : set) as never).where(where));
}

export async function erpDelete(sdb: ScopedDb, table: ErpTable, canWrite: (r: Role) => boolean, id: string) {
  sdb.require(canWrite);
  const where = and(eq(table.id, id), eq(table.organizationId, sdb.auth.orgId), isNull(table.deletedAt));
  const [row] = await sdb.db.select({ id: table.id }).from(table).where(where).limit(1);
  if (!row) throw new NotFoundError("No existe");
  const ts = sdb.now();
  const set = { deletedAt: ts, updatedAt: ts };
  await write(sdb, table, sdb.db.update(table).set((isSynced(table) ? { ...set, version: currentVersion } : set) as never).where(where));
}
