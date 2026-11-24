/**
 * Aplicación de un push. Todo en un solo db.batch() = una transacción.
 * Presupuesto: ≤ 40 mutaciones → ~9 lecturas + ~15 escrituras, bajo el límite de 50 queries de D1.
 * Lecturas y contexto en push/context.ts, un manejador por tipo de mutación en push/index.ts,
 * escrituras en push/writes.ts.
 */
import type { Mutation, PushResponse } from "@yvy/shared";
import type * as s from "@yvy/shared/schema";
import { runBatch } from "./client";
import type { ScopedDb } from "./scoped";
import { buildContext } from "./push/context";
import { decide } from "./push/index";
import { buildWrites } from "./push/writes";

/**
 * Aplica las mutaciones de un push del celular en un solo db.batch(). `created` recibe los registros nuevos para
 * avisar a los webhooks.
 */
export async function applyPush(
  sdb: ScopedDb,
  deviceId: string,
  mutations: Mutation[],
  now = Date.now(),
  /** Recibe los registros que este push crea (no los que edita), para avisar a los webhooks. */
  created?: (typeof s.records.$inferInsert)[],
): Promise<PushResponse> {
  const ctx = await buildContext(sdb, deviceId, mutations, now, created);
  for (const m of mutations) await decide(ctx, m);
  await runBatch(sdb.db, await buildWrites(ctx));
  return { results: ctx.results };
}
