/** Tareas: listado, edición, comentarios y borrado. */
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { LIMITS, parseTaskComments, type TaskComment } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { newId } from "@yvy/shared";
import { can, ForbiddenError, NotFoundError, type ScopedDb } from "../scoped";
import { updateSynced } from "./farm-edits";

// ---------- Tareas ----------

/** Tareas de la organización con filtros; el empleado ve solo las suyas. */
export async function listTasks(
  sdb: ScopedDb,
  f: { farmId?: string; assigneeId?: string; status?: string; from?: string; to?: string },
) {
  return sdb.db
    .select({ task: s.tasks, assigneeName: s.users.fullName, plotName: s.plots.name })
    .from(s.tasks)
    .leftJoin(s.users, eq(s.users.id, s.tasks.assigneeId))
    .leftJoin(s.plots, eq(s.plots.id, s.tasks.plotId))
    .where(
      and(
        eq(s.tasks.organizationId, sdb.auth.orgId),
        isNull(s.tasks.deletedAt),
        sdb.workerFilter("tasks"),
        f.farmId ? eq(s.tasks.farmId, f.farmId) : undefined,
        f.assigneeId ? eq(s.tasks.assigneeId, f.assigneeId) : undefined,
        f.status ? eq(s.tasks.status, f.status as "open") : undefined,
        f.from ? gte(s.tasks.dueDate, f.from) : undefined,
        f.to ? lte(s.tasks.dueDate, f.to) : undefined,
      ),
    )
    .orderBy(asc(s.tasks.dueDate))
    .limit(500);
}

/** Comprueba que el lote sea de la organización y de la misma estancia que la tarea; si no, 404. */
async function requireTaskPlot(sdb: ScopedDb, taskId: string, plotId: string) {
  const [task] = await sdb.db
    .select({ farmId: s.tasks.farmId })
    .from(s.tasks)
    .where(and(eq(s.tasks.id, taskId), eq(s.tasks.organizationId, sdb.auth.orgId), isNull(s.tasks.deletedAt)))
    .limit(1);
  if (!task) throw new NotFoundError("No existe");
  const [plot] = await sdb.db
    .select({ id: s.plots.id })
    .from(s.plots)
    .where(
      and(
        eq(s.plots.id, plotId),
        eq(s.plots.organizationId, sdb.auth.orgId),
        eq(s.plots.farmId, task.farmId),
        isNull(s.plots.deletedAt),
      ),
    )
    .limit(1);
  if (!plot) throw new NotFoundError("Lote inexistente");
}

/** Edita una tarea; la persona asignada debe ser miembro y el lote, de la misma estancia de la tarea. */
export async function updateTask(sdb: ScopedDb, id: string, patch: Partial<typeof s.tasks.$inferInsert>) {
  sdb.require(can.assign);
  if (patch.assigneeId) await sdb.memberRole(patch.assigneeId);
  if (patch.plotId) await requireTaskPlot(sdb, id, patch.plotId);
  await updateSynced(sdb, s.tasks, id, patch);
}

/**
 * Agrega un comentario a la tarea. Los comentarios son un JSON dentro de la tarea: se reescribe con
 * bumpVersion para que baje al celular. Lectura y escritura son dos pasos; si dos personas comentan a la vez
 * gana la última escritura (aceptable con ≤ 50 comentarios de uso ocasional).
 */
export async function addTaskComment(sdb: ScopedDb, id: string, text: string) {
  const [row] = await sdb.db
    .select({ comments: s.tasks.comments })
    .from(s.tasks)
    .where(
      and(
        eq(s.tasks.id, id),
        eq(s.tasks.organizationId, sdb.auth.orgId),
        isNull(s.tasks.deletedAt),
        sdb.workerFilter("tasks"),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("No existe");
  const list = parseTaskComments(row.comments);
  if (list.length >= LIMITS.tasks.maxComments) throw new ForbiddenError("La tarea ya tiene demasiados comentarios");
  const [u] = await sdb.db
    .select({ fullName: s.users.fullName })
    .from(s.users)
    .where(eq(s.users.id, sdb.auth.userId))
    .limit(1);
  const comment: TaskComment = { id: newId(), userId: sdb.auth.userId, name: u?.fullName ?? "", at: sdb.now(), text };
  await updateSynced(sdb, s.tasks, id, { comments: JSON.stringify([...list, comment]) });
  return comment;
}

/** Borra (lógico) una tarea. */
export async function deleteTask(sdb: ScopedDb, id: string) {
  sdb.require(can.assign);
  await updateSynced(sdb, s.tasks, id, { deletedAt: sdb.now() });
}

/** Dar de baja a un miembro: deshabilita la membresía y cierra sus sesiones. */
