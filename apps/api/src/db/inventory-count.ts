/**
 * Recuento físico de un depósito (E-15): un registro `stock_count` contado en el galpón (sin señal) se asienta, al llegar,
 * como ajustes de stock: por cada producto, lo contado menos lo que el sistema tiene en ese depósito en ese momento.
 *
 * - Idempotente por registro: el id del registro es el `originId` de sus ajustes. Si el registro llega de nuevo o editado,
 *   se revierten sus ajustes anteriores (borrado lógico) y se calculan los nuevos contra el stock sin ellos; si se borra,
 *   se revierten. Un producto que ya está en lo contado no genera ajuste.
 * - Va en el mismo db.batch() del push. Valorizado al costo promedio (como adjustStock). Un depósito que no es de la
 *   organización no genera nada (la organización se verifica acá, el celular solo lo conoce por la sincronización).
 * - Cuatro consultas como mucho para todos los recuentos del envío.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { avgUnitCost, LIMITS, moveValue, newId, type StockTotals } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { chunkForParams, type Stmt } from "./client";
import type { EffectRecord } from "./erp-effects";
import type { ScopedDb } from "./scoped";
import { emptyTotals, productTotals } from "./stock-moves";

export const isCount = (kind: string) => kind === "stock_count";
const EPS = 1e-9;

interface CountLine {
  productId: string;
  counted: number;
}

export async function countEffects(sdb: ScopedDb, upserts: EffectRecord[], deletedIds: string[]): Promise<Stmt[]> {
  const deleted = new Set(deletedIds);
  const byId = new Map<string, EffectRecord>();
  for (const r of upserts) if (isCount(r.kind) && !deleted.has(r.id)) byId.set(r.id, r);
  const recs = [...byId.values()];
  const reverseIds = [...new Set([...deletedIds, ...recs.map((r) => r.id)])];
  if (!reverseIds.length) return [];

  const { db } = sdb;
  const org = sdb.auth.orgId;
  const now = sdb.now();
  const stmts: Stmt[] = [];
  const mine = (ids: string[]) => and(eq(s.stockMoves.organizationId, org), eq(s.stockMoves.origin, "adjustment"), inArray(s.stockMoves.originId, ids), isNull(s.stockMoves.deletedAt));
  for (const chunk of chunkForParams(reverseIds, 1))
    stmts.push(db.update(s.stockMoves).set({ deletedAt: now, updatedAt: now }).where(mine(chunk)));
  if (!recs.length) return stmts;

  const lines = (r: EffectRecord) => ((r.data.lines as CountLine[] | undefined) ?? []).filter((l) => typeof l.productId === "string");
  const warehouseIds = [...new Set(recs.map((r) => String(r.data.warehouseId)))];
  const productIds = [...new Set(recs.flatMap((r) => lines(r).map((l) => l.productId)))];
  const [warehouses, products, oldMoves, totals] = await Promise.all([
    Promise.all(
      chunkForParams(warehouseIds, 2).map((c) =>
        db
          .select({ id: s.warehouses.id })
          .from(s.warehouses)
          .where(and(eq(s.warehouses.organizationId, org), isNull(s.warehouses.deletedAt), inArray(s.warehouses.id, c))),
      ),
    ).then((r) => r.flat()),
    Promise.all(
      chunkForParams(productIds, 2).map((c) =>
        db
          .select({ id: s.products.id })
          .from(s.products)
          .where(and(eq(s.products.organizationId, org), isNull(s.products.deletedAt), inArray(s.products.id, c))),
      ),
    ).then((r) => r.flat()),
    Promise.all(
      chunkForParams(recs.map((r) => r.id), 1).map((c) =>
        db
          .select({ originId: s.stockMoves.originId, productId: s.stockMoves.productId, qty: s.stockMoves.qty, valuePyg: s.stockMoves.valuePyg })
          .from(s.stockMoves)
          .where(mine(c)),
      ),
    ).then((r) => r.flat()),
    productTotals(sdb, productIds),
  ]);
  const okWarehouse = new Set(warehouses.map((w) => w.id));
  const okProduct = new Set(products.map((p) => p.id));

  // Stock de cada depósito sin los ajustes que estos mismos registros están reemplazando.
  const have = new Map<string, number>();
  for (const wh of warehouseIds.filter((w) => okWarehouse.has(w))) {
    const rows = await Promise.all(
      chunkForParams(productIds, 4).map((c) =>
        db
          .select({ productId: s.stockMoves.productId, qty: sql<number>`SUM(${s.stockMoves.qty})` })
          .from(s.stockMoves)
          .where(
            and(
              eq(s.stockMoves.organizationId, org),
              eq(s.stockMoves.warehouseId, wh),
              isNull(s.stockMoves.deletedAt),
              inArray(s.stockMoves.productId, c),
            ),
          )
          .groupBy(s.stockMoves.productId),
      ),
    );
    for (const r of rows.flat()) have.set(`${wh}|${r.productId}`, r.qty);
  }
  const running = new Map<string, StockTotals>();
  for (const [id, t] of totals) running.set(id, { ...t });
  for (const m of oldMoves) {
    const t = running.get(m.productId);
    if (t) {
      t.qty -= m.qty;
      t.valuePyg -= m.valuePyg;
    }
    const rec = byId.get(m.originId as string);
    if (rec) {
      const k = `${String(rec.data.warehouseId)}|${m.productId}`;
      have.set(k, (have.get(k) ?? 0) - m.qty);
    }
  }

  const moves: (typeof s.stockMoves.$inferInsert)[] = [];
  for (const r of recs) {
    const wh = String(r.data.warehouseId);
    if (!okWarehouse.has(wh)) continue;
    for (const l of lines(r)) {
      if (!okProduct.has(l.productId)) continue;
      const qty = Math.round((l.counted - (have.get(`${wh}|${l.productId}`) ?? 0)) * 1000) / 1000;
      if (Math.abs(qty) < EPS) continue;
      const t = running.get(l.productId) ?? { ...emptyTotals };
      const value = moveValue(qty, avgUnitCost(t));
      t.qty += qty;
      t.valuePyg += qty < 0 ? -value : value;
      running.set(l.productId, t);
      have.set(`${wh}|${l.productId}`, l.counted);
      moves.push({
        id: newId(),
        organizationId: org,
        productId: l.productId,
        warehouseId: wh,
        qty,
        valuePyg: qty < 0 ? -value : value,
        occurredAt: r.capturedAt,
        origin: "adjustment",
        originId: r.id,
        note: typeof r.data.note === "string" ? r.data.note.slice(0, 200) : "Recuento",
        createdBy: sdb.auth.userId,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  if (moves.length > LIMITS.erp.maxEffectMovesPerPush) throw new HTTPException(503, { message: "Demasiados ajustes en un solo envío: dividilo" });
  // 18 columnas por fila: 5 filas por sentencia (tope de 100 parámetros de D1).
  for (const chunk of chunkForParams(moves, 18)) stmts.push(db.insert(s.stockMoves).values(chunk));
  return stmts;
}
