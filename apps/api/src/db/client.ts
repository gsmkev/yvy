import { drizzle } from "drizzle-orm/d1";
import type { BatchItem } from "drizzle-orm/batch";
import { sql } from "drizzle-orm";
import * as schema from "@yvy/shared/schema";

export const getDb = (d1: D1Database) => drizzle(d1, { schema });
export type DB = ReturnType<typeof getDb>;
export type Stmt = BatchItem<"sqlite">;

/** D1 admite 100 parámetros por consulta; dejamos margen. */
const MAX_PARAMS = 90;

export const chunkForParams = <T>(rows: T[], paramsPerRow: number): T[][] => {
  const size = Math.max(1, Math.floor(MAX_PARAMS / paramsPerRow));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};

/** Ejecuta en una sola transacción (db.batch). No-op si no hay sentencias. */
export const runBatch = async (db: DB, stmts: Stmt[]): Promise<void> => {
  if (stmts.length === 0) return;
  await db.batch(stmts as [Stmt, ...Stmt[]]);
};

/** Sube el contador global; debe ir primero en el batch que escribe filas sincronizadas. */
export const bumpVersion = (db: DB): Stmt =>
  db
    .insert(schema.syncSeq)
    .values({ id: 1, v: 1 })
    .onConflictDoUpdate({ target: schema.syncSeq.id, set: { v: sql`${schema.syncSeq.v} + 1` } });

/** Valor de versión dentro del mismo batch, después de bumpVersion. */
export const currentVersion = sql<number>`(SELECT v FROM sync_seq WHERE id = 1)`;
