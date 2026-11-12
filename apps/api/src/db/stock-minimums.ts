/** Stock mínimo por producto y depósito con aviso de reposición (E-14). El agrónomo ve cantidades; dueño y administrador editan. */
import { and, eq, isNull } from "drizzle-orm";
import { belowMinimum, newId, type LowStockRow } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { requireOwned } from "./erp";
import { can, NotFoundError, type ScopedDb } from "./scoped";
import { stockSummary } from "./stock-moves";

export async function listMinimums(sdb: ScopedDb) {
  sdb.require(can.viewStock);
  return sdb.db.select().from(s.stockMinimums).where(eq(s.stockMinimums.organizationId, sdb.auth.orgId));
}

/** Alta o cambio (una fila por producto y depósito). */
export async function saveMinimum(sdb: ScopedDb, i: { productId: string; warehouseId: string; minQty: number }) {
  sdb.require(can.manageErp);
  await requireOwned(sdb, s.products, i.productId, "El producto");
  await requireOwned(sdb, s.warehouses, i.warehouseId, "El depósito");
  const ts = sdb.now();
  await sdb.db
    .insert(s.stockMinimums)
    .values({ id: newId(), organizationId: sdb.auth.orgId, ...i, createdBy: sdb.auth.userId, createdAt: ts, updatedAt: ts })
    .onConflictDoUpdate({
      target: [s.stockMinimums.organizationId, s.stockMinimums.productId, s.stockMinimums.warehouseId],
      set: { minQty: i.minQty, updatedAt: ts, deletedAt: null },
    });
}

export async function deleteMinimum(sdb: ScopedDb, id: string) {
  sdb.require(can.manageErp);
  const where = and(eq(s.stockMinimums.id, id), eq(s.stockMinimums.organizationId, sdb.auth.orgId));
  const [row] = await sdb.db.select({ id: s.stockMinimums.id }).from(s.stockMinimums).where(where).limit(1);
  if (!row) throw new NotFoundError("No existe");
  await sdb.db.delete(s.stockMinimums).where(where);
}

/** Productos por debajo del mínimo de su depósito. Tres consultas (mínimos, stock, y la del permiso). */
export async function lowStock(sdb: ScopedDb): Promise<LowStockRow[]> {
  sdb.require(can.viewStock);
  const [mins, stock] = await Promise.all([
    sdb.db
      .select({ productId: s.stockMinimums.productId, warehouseId: s.stockMinimums.warehouseId, minQty: s.stockMinimums.minQty })
      .from(s.stockMinimums)
      .where(and(eq(s.stockMinimums.organizationId, sdb.auth.orgId), isNull(s.stockMinimums.deletedAt))),
    stockSummary(sdb),
  ]);
  return belowMinimum(stock.rows, mins);
}
