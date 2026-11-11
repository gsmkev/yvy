/**
 * ERP sencillo (ADR 0004): altas, cambios y bajas de los maestros de oficina (terceros, depósitos, tipos de cambio...).
 * Casi todas son de oficina y no se sincronizan; las que bajan al celular llevan `version`. Todo filtra por organización y usa borrado lógico.
 */
import { and, asc, desc, eq, isNull, lte } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { newId, type Role } from "@yvy/shared";
import { bumpVersion, currentVersion, runBatch, type Stmt } from "./client";
import * as s from "@yvy/shared/schema";
import { can, NotFoundError, type ScopedDb } from "./scoped";

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

/** Falla con 404 si la fila no existe en la organización (para ids que llegan en un body). */
export async function requireOwned(sdb: ScopedDb, table: ErpTable, id: string, what = "El registro") {
  const [row] = await sdb.db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.organizationId, sdb.auth.orgId), isNull(table.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError(`${what} no existe`);
}

// ---------- Tipos de cambio (E-06) ----------

export async function listRates(sdb: ScopedDb, limit = 120) {
  sdb.require(can.manageErp);
  return sdb.db
    .select({ date: s.exchangeRates.date, usdToPyg: s.exchangeRates.usdToPyg })
    .from(s.exchangeRates)
    .where(eq(s.exchangeRates.organizationId, sdb.auth.orgId))
    .orderBy(desc(s.exchangeRates.date))
    .limit(limit);
}

/** Alta o cambio del tipo de cambio de un día (una fila por día). */
export async function saveRate(sdb: ScopedDb, date: string, usdToPyg: number) {
  sdb.require(can.manageErp);
  await sdb.db
    .insert(s.exchangeRates)
    .values({ organizationId: sdb.auth.orgId, date, usdToPyg, updatedBy: sdb.auth.userId, updatedAt: sdb.now() })
    .onConflictDoUpdate({
      target: [s.exchangeRates.organizationId, s.exchangeRates.date],
      set: { usdToPyg, updatedBy: sdb.auth.userId, updatedAt: sdb.now() },
    });
}

export async function deleteRate(sdb: ScopedDb, date: string) {
  sdb.require(can.manageErp);
  const where = and(eq(s.exchangeRates.organizationId, sdb.auth.orgId), eq(s.exchangeRates.date, date));
  const [row] = await sdb.db.select({ date: s.exchangeRates.date }).from(s.exchangeRates).where(where).limit(1);
  if (!row) throw new NotFoundError("No hay tipo de cambio ese día");
  await sdb.db.delete(s.exchangeRates).where(where);
}

/**
 * Guaraníes por dólar para un día: el último cargado hasta ese día; si todos son posteriores, el más antiguo
 * (ver rateOn). Sin ninguno, null. Dos consultas como mucho.
 */
export async function usdRateOn(sdb: ScopedDb, day: string): Promise<number | null> {
  const org = sdb.auth.orgId;
  const [upTo] = await sdb.db
    .select({ r: s.exchangeRates.usdToPyg })
    .from(s.exchangeRates)
    .where(and(eq(s.exchangeRates.organizationId, org), lte(s.exchangeRates.date, day)))
    .orderBy(desc(s.exchangeRates.date))
    .limit(1);
  if (upTo) return upTo.r;
  const [oldest] = await sdb.db
    .select({ r: s.exchangeRates.usdToPyg })
    .from(s.exchangeRates)
    .where(eq(s.exchangeRates.organizationId, org))
    .orderBy(asc(s.exchangeRates.date))
    .limit(1);
  return oldest?.r ?? null;
}

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
