/**
 * Movimientos de stock (E-11): compra, consumo, transferencia y ajuste, a costo promedio ponderado.
 * El stock de un producto es la suma de `qty`; el costo promedio, valor / cantidad (funciones puras en shared/erp.ts).
 * Tablas de oficina: no se sincronizan, así que no llevan bumpVersion. Escrituras con db.batch().
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { avgUnitCost, daysUntil, LIMITS, localDate, lotsRemaining, moveValue, newId, noonAsuncion, type Role, type StockTotals } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { chunkForParams, runBatch, type Stmt } from "./client";
import { pygOf } from "./costs";
import { requireOwned } from "./erp";
import { can, NotFoundError, type ScopedDb } from "./scoped";

export const emptyTotals: StockTotals = { qty: 0, valuePyg: 0, lastUnitCost: null };

/** Cantidad, valor y costo de la última compra de cada producto (una consulta por tanda de productos). */
export async function productTotals(sdb: ScopedDb, productIds: string[]): Promise<Map<string, StockTotals>> {
  const org = sdb.auth.orgId;
  const out = new Map<string, StockTotals>();
  for (const chunk of chunkForParams([...new Set(productIds)], 2)) {
    const rows = await sdb.db
      .select({
        productId: s.stockMoves.productId,
        qty: sql<number>`SUM(${s.stockMoves.qty})`,
        value: sql<number>`SUM(${s.stockMoves.valuePyg})`,
        last: sql<number | null>`(SELECT m2.value_pyg * 1.0 / m2.qty FROM stock_moves m2 WHERE m2.organization_id = ${org} AND m2.product_id = stock_moves.product_id AND m2.origin = 'purchase' AND m2.qty > 0 AND m2.deleted_at IS NULL ORDER BY m2.occurred_at DESC, m2.created_at DESC LIMIT 1)`,
      })
      .from(s.stockMoves)
      .where(
        and(eq(s.stockMoves.organizationId, org), isNull(s.stockMoves.deletedAt), inArray(s.stockMoves.productId, chunk)),
      )
      .groupBy(s.stockMoves.productId);
    for (const r of rows) out.set(r.productId, { qty: r.qty, valuePyg: r.value, lastUnitCost: r.last });
  }
  return out;
}

/** Cantidad de un producto en un depósito. */
async function warehouseQty(sdb: ScopedDb, productId: string, warehouseId: string): Promise<number> {
  const [r] = await sdb.db
    .select({ qty: sql<number>`COALESCE(SUM(${s.stockMoves.qty}), 0)` })
    .from(s.stockMoves)
    .where(
      and(
        eq(s.stockMoves.organizationId, sdb.auth.orgId),
        eq(s.stockMoves.productId, productId),
        eq(s.stockMoves.warehouseId, warehouseId),
        isNull(s.stockMoves.deletedAt),
      ),
    );
  return r?.qty ?? 0;
}

const EPS = 1e-9;
async function requireStock(sdb: ScopedDb, productId: string, warehouseId: string, qty: number) {
  const have = await warehouseQty(sdb, productId, warehouseId);
  if (have + EPS < qty)
    throw new HTTPException(409, { message: `No hay stock suficiente en el depósito: hay ${Math.round(have * 100) / 100}` });
}

async function requireProductAndWarehouses(sdb: ScopedDb, productId: string, warehouseIds: string[]) {
  await requireOwned(sdb, s.products, productId, "El producto");
  for (const w of warehouseIds) await requireOwned(sdb, s.warehouses, w, "El depósito");
}

/** Sin permiso para ver montos (agrónomo), se quitan valores, montos y monedas. */
const mask = <T extends { valuePyg?: unknown; amount?: unknown; currency?: unknown; photoPath?: unknown }>(
  role: Role,
  rows: T[],
): T[] =>
  can.manageErp(role)
    ? rows
    : rows.map((r) => ({ ...r, valuePyg: undefined, amount: undefined, currency: undefined, photoPath: undefined }));

const base = (sdb: ScopedDb, i: { productId: string; warehouseId: string; date: string; note?: string | null }) => {
  const ts = sdb.now();
  return {
    id: newId(),
    organizationId: sdb.auth.orgId,
    productId: i.productId,
    warehouseId: i.warehouseId,
    occurredAt: noonAsuncion(i.date),
    note: i.note?.trim() || null,
    createdBy: sdb.auth.userId,
    createdAt: ts,
    updatedAt: ts,
  };
};

export async function purchaseStock(
  sdb: ScopedDb,
  i: {
    productId: string;
    warehouseId: string;
    date: string;
    qty: number;
    amount: number;
    currency: "PYG" | "USD";
    partyId?: string | null;
    lot?: string | null;
    expiresOn?: string | null;
    note?: string | null;
  },
) {
  sdb.require(can.manageErp);
  await requireProductAndWarehouses(sdb, i.productId, [i.warehouseId]);
  if (i.partyId) await requireOwned(sdb, s.parties, i.partyId, "El proveedor");
  const valuePyg = await pygOf(sdb, i.amount, i.currency, i.date);
  const row = {
    ...base(sdb, i),
    qty: i.qty,
    valuePyg,
    amount: i.amount,
    currency: i.currency,
    origin: "purchase" as const,
    partyId: i.partyId ?? null,
    lot: i.lot?.trim() || null,
    expiresOn: i.expiresOn ?? null,
  };
  await sdb.db.insert(s.stockMoves).values(row);
  return { id: row.id };
}

/** Consumo manual a costo promedio. Con `plotId` carga el costo al lote (con su estancia y actividad). */
export async function consumeStock(
  sdb: ScopedDb,
  i: {
    productId: string;
    warehouseId: string;
    date: string;
    qty: number;
    plotId?: string | null;
    seasonId?: string | null;
    note?: string | null;
  },
) {
  sdb.require(can.manageErp);
  await requireProductAndWarehouses(sdb, i.productId, [i.warehouseId]);
  await requireStock(sdb, i.productId, i.warehouseId, i.qty);
  if (i.seasonId) await requireOwned(sdb, s.seasons, i.seasonId, "La campaña");
  let plot: { id: string; farmId: string; kind: string } | undefined;
  if (i.plotId) {
    [plot] = await sdb.db
      .select({ id: s.plots.id, farmId: s.plots.farmId, kind: s.plots.kind })
      .from(s.plots)
      .where(and(eq(s.plots.id, i.plotId), eq(s.plots.organizationId, sdb.auth.orgId), isNull(s.plots.deletedAt)))
      .limit(1);
    if (!plot) throw new NotFoundError("Lote inexistente");
  }
  const totals = (await productTotals(sdb, [i.productId])).get(i.productId) ?? emptyTotals;
  const value = moveValue(i.qty, avgUnitCost(totals));
  const move = { ...base(sdb, i), qty: -i.qty, valuePyg: -value, origin: "consumption" as const, originId: null };
  const stmts: Stmt[] = [sdb.db.insert(s.stockMoves).values(move)];
  if (plot && value > 0)
    stmts.push(
      sdb.db.insert(s.costEntries).values({
        id: newId(),
        organizationId: sdb.auth.orgId,
        occurredAt: move.occurredAt,
        farmId: plot.farmId,
        plotId: plot.id,
        seasonId: i.seasonId ?? null,
        activity: plot.kind === "pasture" ? "ganaderia" : "agricultura",
        category: "input",
        description: i.note?.trim() || null,
        amount: value,
        currency: "PYG",
        amountPyg: value,
        productId: i.productId,
        origin: "consumption",
        originId: move.id,
        createdBy: sdb.auth.userId,
        createdAt: move.createdAt,
        updatedAt: move.updatedAt,
      }),
    );
  await runBatch(sdb.db, stmts);
  return { id: move.id };
}

/** Transferencia entre depósitos: salida y entrada con el mismo valor (al costo promedio) y el mismo `originId`. */
export async function transferStock(
  sdb: ScopedDb,
  i: { productId: string; fromWarehouseId: string; toWarehouseId: string; date: string; qty: number; note?: string | null },
) {
  sdb.require(can.manageErp);
  if (i.fromWarehouseId === i.toWarehouseId) throw new HTTPException(400, { message: "Elegí dos depósitos distintos" });
  await requireProductAndWarehouses(sdb, i.productId, [i.fromWarehouseId, i.toWarehouseId]);
  await requireStock(sdb, i.productId, i.fromWarehouseId, i.qty);
  const totals = (await productTotals(sdb, [i.productId])).get(i.productId) ?? emptyTotals;
  const value = moveValue(i.qty, avgUnitCost(totals));
  const transferId = newId();
  const common = { origin: "transfer" as const, originId: transferId };
  await runBatch(sdb.db, [
    sdb.db
      .insert(s.stockMoves)
      .values({ ...base(sdb, { ...i, warehouseId: i.fromWarehouseId }), qty: -i.qty, valuePyg: -value, ...common }),
    sdb.db
      .insert(s.stockMoves)
      .values({ ...base(sdb, { ...i, warehouseId: i.toWarehouseId }), qty: i.qty, valuePyg: value, ...common }),
  ]);
  return { id: transferId };
}

/** Ajuste por recuento, valorizado al costo promedio. */
export async function adjustStock(
  sdb: ScopedDb,
  i: { productId: string; warehouseId: string; date: string; qty: number; note?: string | null },
) {
  sdb.require(can.manageErp);
  await requireProductAndWarehouses(sdb, i.productId, [i.warehouseId]);
  if (i.qty < 0) await requireStock(sdb, i.productId, i.warehouseId, -i.qty);
  const totals = (await productTotals(sdb, [i.productId])).get(i.productId) ?? emptyTotals;
  const value = moveValue(i.qty, avgUnitCost(totals));
  const row = {
    ...base(sdb, i),
    qty: i.qty,
    valuePyg: i.qty < 0 ? -value : value,
    origin: "adjustment" as const,
    originId: null,
  };
  await sdb.db.insert(s.stockMoves).values(row);
  return { id: row.id };
}

/** Un depósito con movimientos no se borra (el stock quedaría sin lugar). */
export async function requireWarehouseUnused(sdb: ScopedDb, id: string) {
  const [m] = await sdb.db
    .select({ id: s.stockMoves.id })
    .from(s.stockMoves)
    .where(and(eq(s.stockMoves.organizationId, sdb.auth.orgId), eq(s.stockMoves.warehouseId, id), isNull(s.stockMoves.deletedAt)))
    .limit(1);
  if (m) throw new HTTPException(409, { message: "El depósito tiene movimientos de stock: no se puede borrar" });
}

/** Stock por producto y depósito. El agrónomo ve cantidades; dueño y administrador, también el valor y el costo promedio. */
export async function stockSummary(sdb: ScopedDb) {
  sdb.require(can.viewStock);
  const rows = await sdb.db
    .select({
      productId: s.stockMoves.productId,
      warehouseId: s.stockMoves.warehouseId,
      qty: sql<number>`SUM(${s.stockMoves.qty})`,
      valuePyg: sql<number>`SUM(${s.stockMoves.valuePyg})`,
    })
    .from(s.stockMoves)
    .where(and(eq(s.stockMoves.organizationId, sdb.auth.orgId), isNull(s.stockMoves.deletedAt)))
    .groupBy(s.stockMoves.productId, s.stockMoves.warehouseId);
  const perProduct = new Map<string, StockTotals>();
  for (const r of rows) {
    const t = perProduct.get(r.productId) ?? { qty: 0, valuePyg: 0, lastUnitCost: null };
    t.qty += r.qty;
    t.valuePyg += r.valuePyg;
    perProduct.set(r.productId, t);
  }
  const amounts = can.manageErp(sdb.auth.role);
  const q3 = (n: number) => Math.round(n * 1000) / 1000;
  return {
    rows: rows.map((r) => ({
      productId: r.productId,
      warehouseId: r.warehouseId,
      qty: q3(r.qty),
      ...(amounts ? { valuePyg: r.valuePyg } : {}),
    })),
    products: [...perProduct].map(([productId, t]) => ({
      productId,
      qty: q3(t.qty),
      ...(amounts ? { valuePyg: t.valuePyg, avgCostPyg: Math.round(avgUnitCost(t) * 100) / 100 } : {}),
    })),
  };
}

export async function listMoves(sdb: ScopedDb, f: { productId?: string; warehouseId?: string }) {
  sdb.require(can.viewStock);
  const rows = await sdb.db
    .select()
    .from(s.stockMoves)
    .where(
      and(
        eq(s.stockMoves.organizationId, sdb.auth.orgId),
        isNull(s.stockMoves.deletedAt),
        f.productId ? eq(s.stockMoves.productId, f.productId) : undefined,
        f.warehouseId ? eq(s.stockMoves.warehouseId, f.warehouseId) : undefined,
      ),
    )
    .orderBy(desc(s.stockMoves.occurredAt), desc(s.stockMoves.createdAt))
    .limit(LIMITS.erp.listLimit);
  return mask(sdb.auth.role, rows);
}

/** Borra un movimiento cargado a mano (con su otra pata si es transferencia y el costo si fue un consumo con lote). */
export async function deleteMove(sdb: ScopedDb, id: string) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const [m] = await sdb.db
    .select()
    .from(s.stockMoves)
    .where(and(eq(s.stockMoves.id, id), eq(s.stockMoves.organizationId, org), isNull(s.stockMoves.deletedAt)))
    .limit(1);
  if (!m) throw new NotFoundError("No existe");
  if (m.origin === "consumption" && m.originId)
    throw new HTTPException(409, { message: "Este consumo lo generó un registro de campo: corregí el registro" });
  if (m.origin === "adjustment" && m.originId)
    throw new HTTPException(409, { message: "Este ajuste lo generó un recuento: corregí el recuento" });
  const ts = sdb.now();
  const gone = { deletedAt: ts, updatedAt: ts };
  const stmts: Stmt[] = [
    m.origin === "transfer" && m.originId
      ? sdb.db
          .update(s.stockMoves)
          .set(gone)
          .where(and(eq(s.stockMoves.organizationId, org), eq(s.stockMoves.originId, m.originId)))
      : sdb.db.update(s.stockMoves).set(gone).where(eq(s.stockMoves.id, id)),
  ];
  if (m.origin === "consumption")
    stmts.push(
      sdb.db
        .update(s.costEntries)
        .set(gone)
        .where(
          and(eq(s.costEntries.organizationId, org), eq(s.costEntries.origin, "consumption"), eq(s.costEntries.originId, id)),
        ),
    );
  await runBatch(sdb.db, stmts);
}

/**
 * Lotes que vencen dentro de `days` días (o ya vencieron) y todavía tienen producto (E-12). Tres consultas.
 * Lo que queda de cada lote sale de la regla FEFO (ver lotsRemaining): se toman todas las compras de los productos
 * que tienen algún lote con vencimiento, porque los lotes sin vencimiento se consumen al final.
 */
export async function expiringLots(sdb: ScopedDb, days: number = LIMITS.erp.expiryWarnDays) {
  sdb.require(can.viewStock);
  const org = sdb.auth.orgId;
  const today = localDate(sdb.now());
  const purchase = and(eq(s.stockMoves.organizationId, org), eq(s.stockMoves.origin, "purchase"), isNull(s.stockMoves.deletedAt));
  const withExpiry = await sdb.db
    .selectDistinct({ productId: s.stockMoves.productId })
    .from(s.stockMoves)
    .where(and(purchase, sql`${s.stockMoves.expiresOn} IS NOT NULL`))
    .limit(LIMITS.erp.listLimit);
  if (!withExpiry.length) return [];
  const ids = withExpiry.map((r) => r.productId);
  const lots = (
    await Promise.all(
      chunkForParams(ids, 2).map((chunk) =>
        sdb.db
          .select({ productId: s.stockMoves.productId, lot: s.stockMoves.lot, expiresOn: s.stockMoves.expiresOn, qty: s.stockMoves.qty })
          .from(s.stockMoves)
          .where(and(purchase, inArray(s.stockMoves.productId, chunk))),
      ),
    )
  ).flat();
  const totals = await productTotals(sdb, ids);
  const byProduct = new Map<string, typeof lots>();
  for (const l of lots) byProduct.set(l.productId, [...(byProduct.get(l.productId) ?? []), l]);
  const out: { productId: string; lot: string | null; expiresOn: string; daysLeft: number; remaining: number }[] = [];
  for (const [productId, ls] of byProduct)
    for (const l of lotsRemaining(ls, totals.get(productId)?.qty ?? 0)) {
      if (!l.expiresOn) continue;
      const daysLeft = daysUntil(today, l.expiresOn);
      if (l.remaining > 0 && daysLeft <= days) out.push({ productId, lot: l.lot, expiresOn: l.expiresOn, daysLeft, remaining: l.remaining });
    }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}
