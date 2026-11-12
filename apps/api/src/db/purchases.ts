/**
 * Compras (E-33): orden, factura del proveedor y recepción en un depósito.
 * La recepción crea un movimiento de compra de stock por cada línea con producto (el costo llega al consumirlo, a costo
 * promedio) y un costo por cada línea sin producto (servicio, flete, repuesto...). Con la recepción revertida,
 * todo eso se borra. Solo dueño y administrador: son montos. Las escrituras van en un db.batch().
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { lineAmount, LIMITS, newId, noonAsuncion, purchaseStatus, type Activity, type CostCategory, type Currency } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { chunkForParams, runBatch, type Stmt } from "./client";
import { pygOf } from "./costs";
import { requireOwned } from "./erp";
import { can, NotFoundError, type ScopedDb } from "./scoped";

interface LineIn {
  productId?: string | null;
  description?: string | null;
  category?: CostCategory | null;
  activity?: Activity | null;
  qty: number;
  unitPrice: number;
  lot?: string | null;
  expiresOn?: string | null;
}

const total = (lines: { qty: number; unitPrice: number }[]) => lines.reduce((a, l) => a + lineAmount(l.qty, l.unitPrice), 0);

export async function createPurchase(
  sdb: ScopedDb,
  i: { partyId?: string | null; farmId?: string | null; orderDate: string; expectedDate?: string | null; currency: Currency; note?: string | null; lines: LineIn[] },
) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  if (i.partyId) await requireOwned(sdb, s.parties, i.partyId, "El proveedor");
  if (i.farmId) await sdb.requireFarm(i.farmId);
  const productIds = [...new Set(i.lines.flatMap((l) => (l.productId ? [l.productId] : [])))];
  if (productIds.length) {
    const found = await sdb.db
      .select({ id: s.products.id })
      .from(s.products)
      .where(and(eq(s.products.organizationId, org), isNull(s.products.deletedAt), inArray(s.products.id, productIds)));
    if (found.length !== productIds.length) throw new NotFoundError("Un producto no existe");
  }
  const amount = total(i.lines);
  const totalPyg = await pygOf(sdb, amount, i.currency, i.orderDate);
  const ts = sdb.now();
  const id = newId();
  const lines = i.lines.map((l) => ({
    id: newId(),
    organizationId: org,
    purchaseId: id,
    productId: l.productId ?? null,
    description: l.description?.trim() || null,
    category: l.productId ? null : (l.category ?? "other"),
    activity: l.productId ? null : (l.activity ?? "administracion"),
    qty: l.qty,
    unitPrice: l.unitPrice,
    lot: l.lot?.trim() || null,
    expiresOn: l.expiresOn ?? null,
    createdAt: ts,
    updatedAt: ts,
  }));
  await runBatch(sdb.db, [
    sdb.db.insert(s.purchases).values({
      id,
      organizationId: org,
      partyId: i.partyId ?? null,
      farmId: i.farmId ?? null,
      orderDate: i.orderDate,
      expectedDate: i.expectedDate ?? null,
      currency: i.currency,
      totalAmount: amount,
      totalPyg,
      note: i.note?.trim() || null,
      createdBy: sdb.auth.userId,
      createdAt: ts,
      updatedAt: ts,
    }),
    ...chunkForParams(lines, 15).map((c) => sdb.db.insert(s.purchaseLines).values(c)),
  ]);
  return { id };
}

export async function listPurchases(sdb: ScopedDb, f: { status?: string }) {
  sdb.require(can.manageErp);
  const rows = await sdb.db
    .select()
    .from(s.purchases)
    .where(and(eq(s.purchases.organizationId, sdb.auth.orgId), isNull(s.purchases.deletedAt)))
    .orderBy(desc(s.purchases.orderDate), desc(s.purchases.createdAt))
    .limit(LIMITS.erp.listLimit);
  return rows.map((r) => ({ ...r, status: purchaseStatus(r) })).filter((r) => !f.status || r.status === f.status);
}

async function load(sdb: ScopedDb, id: string) {
  const org = sdb.auth.orgId;
  const [p] = await sdb.db
    .select()
    .from(s.purchases)
    .where(and(eq(s.purchases.id, id), eq(s.purchases.organizationId, org), isNull(s.purchases.deletedAt)))
    .limit(1);
  if (!p) throw new NotFoundError("La compra no existe");
  const lines = await sdb.db
    .select()
    .from(s.purchaseLines)
    .where(and(eq(s.purchaseLines.organizationId, org), eq(s.purchaseLines.purchaseId, id), isNull(s.purchaseLines.deletedAt)));
  return { p, lines };
}

export async function getPurchase(sdb: ScopedDb, id: string) {
  sdb.require(can.manageErp);
  const { p, lines } = await load(sdb, id);
  return { ...p, status: purchaseStatus(p), lines };
}

/** Registra (o corrige) la factura del proveedor. Con USD, el total en guaraníes pasa al tipo de cambio de la factura. */
export async function invoicePurchase(sdb: ScopedDb, id: string, i: { invoiceNumber: string; invoiceDate: string; dueDate?: string | null }) {
  sdb.require(can.manageErp);
  const { p } = await load(sdb, id);
  const totalPyg = p.receivedAt ? p.totalPyg : await pygOf(sdb, p.totalAmount, p.currency, i.invoiceDate);
  await sdb.db
    .update(s.purchases)
    .set({ invoiceNumber: i.invoiceNumber.trim(), invoiceDate: i.invoiceDate, dueDate: i.dueDate ?? null, totalPyg, updatedAt: sdb.now() })
    .where(eq(s.purchases.id, id));
}

/** Recibe la compra en un depósito: stock por cada producto y costo por cada gasto. Una sola vez. */
export async function receivePurchase(
  sdb: ScopedDb,
  id: string,
  i: { warehouseId: string; date: string; lines?: { lineId: string; qty?: number; lot?: string | null; expiresOn?: string | null }[] },
) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const { p, lines } = await load(sdb, id);
  if (p.receivedAt) throw new HTTPException(409, { message: "La compra ya se recibió" });
  await requireOwned(sdb, s.warehouses, i.warehouseId, "El depósito");
  const over = new Map((i.lines ?? []).map((l) => [l.lineId, l]));
  for (const k of over.keys()) if (!lines.some((l) => l.id === k)) throw new NotFoundError("Una línea no es de esta compra");
  const ts = sdb.now();
  const occurredAt = noonAsuncion(i.date);
  const moves: (typeof s.stockMoves.$inferInsert)[] = [];
  const costs: (typeof s.costEntries.$inferInsert)[] = [];
  const lineUpdates: Stmt[] = [];
  let newTotal = 0;
  const priced: { qty: number; unitPrice: number; l: (typeof lines)[number]; o?: (typeof i.lines & object)[number] }[] = [];
  for (const l of lines) {
    const o = over.get(l.id);
    const qty = o?.qty ?? l.qty;
    newTotal += lineAmount(qty, l.unitPrice);
    priced.push({ qty, unitPrice: l.unitPrice, l, o });
  }
  const totalPyg = await pygOf(sdb, newTotal, p.currency, p.invoiceDate ?? i.date);
  for (const { qty, unitPrice, l, o } of priced) {
    const amount = lineAmount(qty, unitPrice);
    lineUpdates.push(
      sdb.db
        .update(s.purchaseLines)
        .set({ receivedQty: qty, lot: o?.lot ?? l.lot, expiresOn: o?.expiresOn ?? l.expiresOn, updatedAt: ts })
        .where(eq(s.purchaseLines.id, l.id)),
    );
    if (qty <= 0) continue;
    // El valor de cada línea en guaraníes se reparte del total convertido con el mismo tipo de cambio.
    const valuePyg = newTotal > 0 ? Math.round((amount / newTotal) * totalPyg) : 0;
    if (l.productId)
      moves.push({
        id: newId(),
        organizationId: org,
        productId: l.productId,
        warehouseId: i.warehouseId,
        qty,
        valuePyg,
        lot: o?.lot?.trim() || l.lot,
        expiresOn: o?.expiresOn ?? l.expiresOn,
        amount,
        currency: p.currency,
        occurredAt,
        origin: "purchase",
        originId: id,
        partyId: p.partyId,
        note: p.invoiceNumber ? `Factura ${p.invoiceNumber}` : null,
        createdBy: sdb.auth.userId,
        createdAt: ts,
        updatedAt: ts,
      });
    else
      costs.push({
        id: newId(),
        organizationId: org,
        occurredAt,
        farmId: p.farmId,
        activity: (l.activity ?? "administracion") as Activity,
        category: (l.category ?? "other") as CostCategory,
        description: l.description,
        amount,
        currency: p.currency,
        amountPyg: valuePyg,
        partyId: p.partyId,
        origin: "purchase",
        originId: id,
        createdBy: sdb.auth.userId,
        createdAt: ts,
        updatedAt: ts,
      });
  }
  await runBatch(sdb.db, [
    sdb.db.update(s.purchases).set({ warehouseId: i.warehouseId, receivedAt: i.date, totalAmount: newTotal, totalPyg, updatedAt: ts }).where(eq(s.purchases.id, id)),
    ...lineUpdates,
    ...chunkForParams(moves, 18).map((c) => sdb.db.insert(s.stockMoves).values(c)),
    ...chunkForParams(costs, 22).map((c) => sdb.db.insert(s.costEntries).values(c)),
  ]);
  return { moves: moves.length, costs: costs.length };
}

/** Deshace la recepción: borra los movimientos y costos que generó y la compra vuelve a estar pendiente de recibir. */
export async function revertReception(sdb: ScopedDb, id: string) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const { p } = await load(sdb, id);
  if (!p.receivedAt) throw new HTTPException(409, { message: "La compra todavía no se recibió" });
  const ts = sdb.now();
  const gone = { deletedAt: ts, updatedAt: ts };
  await runBatch(sdb.db, [
    sdb.db
      .update(s.stockMoves)
      .set(gone)
      .where(and(eq(s.stockMoves.organizationId, org), eq(s.stockMoves.origin, "purchase"), eq(s.stockMoves.originId, id), isNull(s.stockMoves.deletedAt))),
    sdb.db
      .update(s.costEntries)
      .set(gone)
      .where(and(eq(s.costEntries.organizationId, org), eq(s.costEntries.origin, "purchase"), eq(s.costEntries.originId, id), isNull(s.costEntries.deletedAt))),
    sdb.db.update(s.purchases).set({ receivedAt: null, warehouseId: null, updatedAt: ts }).where(eq(s.purchases.id, id)),
  ]);
}

export async function deletePurchase(sdb: ScopedDb, id: string) {
  sdb.require(can.manageErp);
  const { p } = await load(sdb, id);
  if (p.receivedAt) throw new HTTPException(409, { message: "Deshacé la recepción antes de borrar la compra" });
  if (p.paidAmount > 0) throw new HTTPException(409, { message: "La compra tiene pagos registrados" });
  const ts = sdb.now();
  await sdb.db.update(s.purchases).set({ deletedAt: ts, updatedAt: ts }).where(eq(s.purchases.id, id));
}
