/**
 * K-06: registro de quién cambió qué y cuándo. Las sentencias van dentro del mismo batch que el cambio, así que
 * si el cambio no se aplica tampoco queda la fila. Una sola sentencia agrupa varias filas (chunkForParams) para no
 * gastar queries de D1.
 */
import { getTableColumns } from "drizzle-orm";
import { LIMITS, newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { chunkForParams, type DB, type Stmt } from "./client";

export type AuditEntity = "farm" | "plot" | "member" | "task" | "record" | "poi" | "product" | "season" | "line";

export interface AuditEntry {
  /** `<entidad>_<verbo>`, por ejemplo `farm_update` o `record_delete`. */
  action: string;
  entity: AuditEntity;
  entityId: string | null;
  detail?: Record<string, unknown>;
}

const COLS = Object.keys(getTableColumns(s.auditLog)).length;

export function auditStmts(
  db: DB,
  who: { userId: string; orgId: string },
  entries: AuditEntry[],
  now: number,
): Stmt[] {
  if (!entries.length) return [];
  const rows = entries.map((e) => ({
    id: newId(),
    actorUserId: who.userId,
    action: e.action,
    organizationId: who.orgId,
    entity: e.entity,
    entityId: e.entityId,
    detail: JSON.stringify(e.detail ?? {}),
    createdAt: now,
  }));
  return chunkForParams(rows, COLS).map((chunk) => db.insert(s.auditLog).values(chunk));
}

/**
 * Qué cambió en una edición: los valores cortos (nombre, cultivo, fecha...) van tal cual; los largos (geometrías,
 * JSON) solo se nombran. Nunca se guardan secretos: los parches de acá son campos de negocio.
 */
export function patchDetail(patch: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const fields: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === "updatedAt" || k === "version" || k === "deletedAt") continue;
    const short =
      v === null ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      (typeof v === "string" && v.length <= LIMITS.audit.maxValueLength);
    if (short) values[k] = v;
    else fields.push(k);
  }
  return { ...(Object.keys(values).length ? { values } : {}), ...(fields.length ? { fields } : {}) };
}
