/**
 * ERP sencillo (ADR 0004): altas, cambios y bajas de los maestros de oficina (terceros, depósitos, tipos de cambio...).
 * Son tablas que no se sincronizan, así que no llevan bumpVersion. Todo filtra por organización y usa borrado lógico.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { newId, type Role } from "@yvy/shared";
import { NotFoundError, type ScopedDb } from "./scoped";

export type ErpTable = SQLiteTable & {
  id: SQLiteColumn;
  organizationId: SQLiteColumn;
  deletedAt: SQLiteColumn;
  updatedAt: SQLiteColumn;
};

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
  await sdb.db
    .insert(table)
    .values({ ...cleanRow(values), id, organizationId: sdb.auth.orgId, createdAt: ts, updatedAt: ts } as never);
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
  await sdb.db
    .update(table)
    .set({ ...cleanRow(patch), updatedAt: sdb.now() } as never)
    .where(where);
}

export async function erpDelete(sdb: ScopedDb, table: ErpTable, canWrite: (r: Role) => boolean, id: string) {
  sdb.require(canWrite);
  const where = and(eq(table.id, id), eq(table.organizationId, sdb.auth.orgId), isNull(table.deletedAt));
  const [row] = await sdb.db.select({ id: table.id }).from(table).where(where).limit(1);
  if (!row) throw new NotFoundError("No existe");
  const ts = sdb.now();
  await sdb.db.update(table).set({ deletedAt: ts, updatedAt: ts } as never).where(where);
}
