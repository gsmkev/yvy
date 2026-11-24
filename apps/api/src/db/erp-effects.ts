/**
 * Consumo automático (E-13): un registro de campo con productos del catálogo descuenta stock y carga costo.
 *
 * - Una aplicación o una fertilización consume dosis por hectárea x superficie hecha; un tratamiento sanitario,
 *   la cantidad que se anotó. Cada producto genera una salida de stock del depósito predeterminado de la estancia,
 *   valorizada al costo promedio ponderado; el registro genera una sola entrada de costo (al lote, con su campaña).
 * - Idempotente por registro: el id del registro es el `originId` de sus filas. Cada vez que el registro llega
 *   (de nuevo o editado) se revierten sus filas anteriores (borrado lógico) y se arman las nuevas; si el registro se
 *   borra, se revierten. El costo promedio que se usa descuenta antes las filas que se están reemplazando.
 * - Entra en el mismo db.batch() del push: o se guarda todo o nada. Si no entra en el presupuesto de consultas de la
 *   invocación se responde 503 y el cliente divide el envío (ver packages/sync).
 */
import { and, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { HTTPException } from "hono/http-exception";
import { CONSUMING_KINDS, LIMITS, type StockTotals } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { chunkForParams, currentVersion, type Stmt } from "./client";
import { contractorCosts, consumptionEntries } from "./erp-effects-costs";
import { readEffectData } from "./erp-effects-data";
import type { ScopedDb } from "./scoped";

export interface EffectRecord {
  id: string;
  farmId: string;
  plotId: string | null;
  kind: string;
  data: Record<string, unknown>;
  capturedAt: number;
}

const consumes = (kind: string) => (CONSUMING_KINDS as readonly string[]).includes(kind);
/**
 * Registros con efectos en el ERP: los que consumen insumos y los que cierran una orden de trabajo y pueden
 * cargar el costo del contratista (siembra y cosecha). Se revisan todos para poder revertir si el registro cambia.
 */
export const hasEffects = (kind: string) => consumes(kind) || kind === "sowing" || kind === "harvest" || kind === "stock_count";

/**
 * Parámetros que ocupa una fila en un INSERT de drizzle: las columnas que se mandan más las omitidas que tienen valor
 * por defecto (las demás van como null literal). D1 admite 100 por consulta: se reparte en sentencias con este conteo.
 */
const rowParams = (table: SQLiteTable, row: Record<string, unknown>) =>
  Object.entries(getTableColumns(table)).filter(([key, col]) => row[key] !== undefined || col.hasDefault).length;
const insertChunks = <T extends Record<string, unknown>>(table: SQLiteTable, rows: T[]): T[][] =>
  rows.length ? chunkForParams(rows, Math.max(...rows.map((r) => rowParams(table, r)))) : [];

/** Revierte (borrado lógico) las salidas de stock y los costos de consumo de estos registros. */
function reverseStmts(sdb: ScopedDb, ids: string[], now: number): Stmt[] {
  const { db } = sdb;
  const org = sdb.auth.orgId;
  const gone = { deletedAt: now, updatedAt: now };
  return chunkForParams(ids, 2).flatMap((chunk) => [
    db
      .update(s.stockMoves)
      .set(gone)
      .where(
        and(
          eq(s.stockMoves.organizationId, org),
          eq(s.stockMoves.origin, "consumption"),
          inArray(s.stockMoves.originId, chunk),
          isNull(s.stockMoves.deletedAt),
        ),
      ),
    db
      .update(s.costEntries)
      .set(gone)
      .where(and(eq(s.costEntries.organizationId, org), inArray(s.costEntries.originId, chunk), isNull(s.costEntries.deletedAt))),
  ]);
}

/** Horómetro u odómetro de las máquinas: queda la lectura más alta (la máquina baja al celular, es sincronizable). */
function meterStmts(sdb: ScopedDb, recs: EffectRecord[], now: number): Stmt[] {
  const meters = new Map<string, number>();
  for (const r of recs)
    if (r.kind === "fuel_load" && typeof r.data.machineId === "string" && typeof r.data.meterValue === "number")
      meters.set(r.data.machineId, Math.max(meters.get(r.data.machineId) ?? 0, r.data.meterValue));
  return [...meters].map(([id, v]) =>
    sdb.db
      .update(s.machines)
      .set({ meterValue: sql`MAX(${s.machines.meterValue}, ${v})`, updatedAt: now, version: currentVersion })
      .where(and(eq(s.machines.id, id), eq(s.machines.organizationId, sdb.auth.orgId), isNull(s.machines.deletedAt))),
  );
}

/**
 * Sentencias que dejan el stock y los costos de `upserts` (registros aceptados en este push) y de `deletedIds`
 * (registros borrados) al día. Devuelve [] sin tocar la base si no hay nada que hacer.
 */
export async function recordEffects(sdb: ScopedDb, upserts: EffectRecord[], deletedIds: string[]): Promise<Stmt[]> {
  const deleted = new Set(deletedIds);
  // El último gana por id; un registro que se borra en el mismo envío no deja efectos.
  const byId = new Map<string, EffectRecord>();
  for (const r of upserts) if (hasEffects(r.kind) && r.kind !== "stock_count" && !deleted.has(r.id)) byId.set(r.id, r);
  const recs = [...byId.values()];
  if (!recs.length && !deletedIds.length) return [];

  const { db } = sdb;
  const now = sdb.now();
  const stmts: Stmt[] = [];
  if (deletedIds.length) stmts.push(...reverseStmts(sdb, deletedIds, now));
  if (!recs.length) return stmts;
  stmts.push(...meterStmts(sdb, recs, now));

  const data = await readEffectData(sdb, recs);
  // Lo que ya habían consumido estos registros se va a reemplazar: no cuenta para el costo promedio.
  const running = new Map<string, StockTotals>();
  for (const [id, t] of data.totals) running.set(id, { ...t });
  for (const m of data.oldMoves) {
    const t = running.get(m.productId);
    if (t) {
      t.qty -= m.qty;
      t.valuePyg -= m.valuePyg;
    }
  }
  const recIds = recs.map((r) => r.id);
  const hadEffects = new Set([...data.oldMoves, ...data.oldCosts].map((m) => m.originId as string));
  stmts.push(...reverseStmts(sdb, recIds.filter((id) => hadEffects.has(id)), now));

  const { moves, costs } = consumptionEntries(sdb, recs, data, running, now);
  costs.push(...(await contractorCosts(sdb, recs, data, now)));
  if (moves.length > LIMITS.erp.maxEffectMovesPerPush)
    throw new HTTPException(503, { message: "Demasiados consumos en un solo envío: dividilo" });
  for (const chunk of insertChunks(s.stockMoves, moves)) stmts.push(db.insert(s.stockMoves).values(chunk));
  for (const chunk of insertChunks(s.costEntries, costs)) stmts.push(db.insert(s.costEntries).values(chunk));
  return stmts;
}
