/**
 * Inventario (ADR 0004): depósitos, movimientos de stock y costo promedio ponderado.
 * Toda la lógica de cantidades y valores vive acá y en packages/shared/src/erp.ts (funciones puras).
 */
import { and, eq, isNull, ne } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import type { ScopedDb } from "./scoped";

/**
 * Mantiene un solo depósito predeterminado por estancia: el que se acaba de marcar, o (si la estancia no tiene
 * ninguno) el que se acaba de guardar. Se llama después de cada alta o cambio de un depósito.
 */
export async function fixDefaultWarehouse(sdb: ScopedDb, id: string) {
  const org = sdb.auth.orgId;
  const [w] = await sdb.db
    .select({ farmId: s.warehouses.farmId, isDefault: s.warehouses.isDefault })
    .from(s.warehouses)
    .where(and(eq(s.warehouses.id, id), eq(s.warehouses.organizationId, org)))
    .limit(1);
  if (!w) return;
  const farm = and(eq(s.warehouses.organizationId, org), eq(s.warehouses.farmId, w.farmId), isNull(s.warehouses.deletedAt));
  if (w.isDefault) {
    await sdb.db.update(s.warehouses).set({ isDefault: false }).where(and(farm, ne(s.warehouses.id, id)));
    return;
  }
  const [other] = await sdb.db
    .select({ id: s.warehouses.id })
    .from(s.warehouses)
    .where(and(farm, eq(s.warehouses.isDefault, true)))
    .limit(1);
  if (!other) await sdb.db.update(s.warehouses).set({ isDefault: true }).where(eq(s.warehouses.id, id));
}
