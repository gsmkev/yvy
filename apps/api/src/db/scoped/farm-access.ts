/** Alcance por estancia (supervisor y permisos finos). */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { isFieldRole } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { runBatch } from "../client";
import type { ScopedDb } from "./index";
import { ForbiddenError, NotFoundError, can } from "./permissions";

/** Estancias a las que cada persona está limitada, para la pantalla de Equipo (solo el dueño). */
export async function listFarmAccess(sdb: ScopedDb) {
  sdb.require(can.manageFarmAccess, "Solo el dueño ve los permisos por estancia");
  return sdb.db
    .select({ userId: s.farmAccess.userId, farmId: s.farmAccess.farmId, level: s.farmAccess.level })
    .from(s.farmAccess)
    .where(eq(s.farmAccess.organizationId, sdb.auth.orgId));
}

/**
 * Reemplaza las estancias de una persona. Supervisor: sin filas no ve ninguna. Administrador y agrónomo: sin filas
 * ven todas; con filas, solo esas (`view` = solo lectura). Avisa al celular para que rehaga sus tablas.
 */
export async function setFarmAccess(sdb: ScopedDb, userId: string, farms: { farmId: string; level: s.FarmAccessLevel }[]): Promise<void> {
  sdb.require(can.manageFarmAccess, "Solo el dueño limita el acceso a estancias");
  const role = await sdb.memberRole(userId);
  if (role === "owner" || isFieldRole(role))
    throw new ForbiddenError("El acceso por estancia es para supervisores, administradores y agrónomos");
  const wanted = new Map(farms.map((f) => [f.farmId, f.level]));
  if (wanted.size) {
    const found = await sdb.db
      .select({ id: s.farms.id })
      .from(s.farms)
      .where(
        and(eq(s.farms.organizationId, sdb.auth.orgId), inArray(s.farms.id, [...wanted.keys()]), isNull(s.farms.deletedAt)),
      );
    if (found.length !== wanted.size) throw new NotFoundError("Estancia inexistente");
  }
  const ts = sdb.now();
  await runBatch(sdb.db, [
    sdb.db
      .delete(s.farmAccess)
      .where(and(eq(s.farmAccess.organizationId, sdb.auth.orgId), eq(s.farmAccess.userId, userId))),
    ...(wanted.size
      ? [
          sdb.db.insert(s.farmAccess).values(
            [...wanted].map(([farmId, level]) => ({
              organizationId: sdb.auth.orgId,
              userId,
              farmId,
              level,
              createdAt: ts,
            })),
          ),
        ]
      : []),
    sdb.db
      .update(s.memberships)
      .set({ assignmentsVersion: sql`${s.memberships.assignmentsVersion} + 1`, updatedAt: ts })
      .where(and(eq(s.memberships.organizationId, sdb.auth.orgId), eq(s.memberships.userId, userId))),
    ...sdb.audit({
      action: "member_farms",
      entity: "member",
      entityId: userId,
      detail: { farms: [...wanted].map(([farmId, level]) => ({ farmId, level })) },
    }),
  ]);
}
