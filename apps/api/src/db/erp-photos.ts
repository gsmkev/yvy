/**
 * Foto de la factura o el ticket de un movimiento de stock o de un costo (E-37).
 * Reusa el flujo de fotos de los registros (PRD §11): URL firmada de R2, el archivo no pasa por el Worker, y una
 * confirmación que verifica el objeto y su tamaño. Solo dueño y administrador (la factura tiene montos).
 */
import { and, eq, isNull } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as s from "@yvy/shared/schema";
import { can, NotFoundError, type ScopedDb } from "./scoped";

export const PHOTO_KINDS = ["stock-moves", "cost-entries"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

type Tbl = SQLiteTable & { id: SQLiteColumn; organizationId: SQLiteColumn; deletedAt: SQLiteColumn; photoPath: SQLiteColumn };
const TABLES: Record<PhotoKind, Tbl> = { "stock-moves": s.stockMoves, "cost-entries": s.costEntries };

/** Clave del objeto en R2: una foto por movimiento. */
export const photoKey = (orgId: string, kind: PhotoKind, id: string) => `organizations/${orgId}/erp/${kind}/${id}.webp`;

/** Comprueba permiso y que la fila sea de la organización; devuelve la clave y la foto ya confirmada, si hay. */
export async function photoTarget(sdb: ScopedDb, kind: PhotoKind, id: string) {
  sdb.require(can.manageErp);
  const t = TABLES[kind];
  const [row] = await sdb.db
    .select({ photoPath: t.photoPath })
    .from(t)
    .where(and(eq(t.id, id), eq(t.organizationId, sdb.auth.orgId), isNull(t.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError("No existe");
  return { key: photoKey(sdb.auth.orgId, kind, id), photoPath: row.photoPath as string | null };
}

export async function setPhotoPath(sdb: ScopedDb, kind: PhotoKind, id: string, path: string | null) {
  const t = TABLES[kind];
  await sdb.db
    .update(t)
    .set({ photoPath: path, updatedAt: sdb.now() } as never)
    .where(and(eq(t.id, id), eq(t.organizationId, sdb.auth.orgId)));
}
