/** Manejadores del push para las tareas: estado, comentarios y checklist. */

import { and, eq } from "drizzle-orm";
import {
  LIMITS,
  closeProblem,
  closeRequirements,
  localDate,
  nextDueDate,
  nextOccurrenceId,
  parseChecklist,
  parseTaskComments,
  resetChecklist,
  serializeChecklist,
  setChecklistItem,
  type Mutation,
} from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { currentVersion } from "../client";
import type { PushCtx } from "./context";

type Of<K extends Mutation["kind"]> = Extract<Mutation, { kind: K }>;
type Task = NonNullable<ReturnType<PushCtx["tasks"]["get"]>>;

/** Ni de otra organización ni (si es empleado) de otra persona, ni de una estancia de solo lectura. */
const taskForbidden = (ctx: PushCtx, t: Task) =>
  (ctx.sdb.isWorker && t.assigneeId !== ctx.userId) || !ctx.farmWritable(t.farmId);

/** UPDATE de una tarea de la organización con los campos dados (versión del batch). */
const updateTask = (ctx: PushCtx, t: Task, set: Partial<typeof s.tasks.$inferInsert>) =>
  ctx.db
    .update(s.tasks)
    .set({ ...set, updatedAt: ctx.now, version: currentVersion })
    .where(and(eq(s.tasks.id, t.id), eq(s.tasks.organizationId, ctx.org)));

/** Al completar una tarea recurrente nace la siguiente, con el mismo id que crea el celular. */
const nextOccurrence = (ctx: PushCtx, t: Task, next: string) =>
  ctx.db
    .insert(s.tasks)
    .values({
      id: nextOccurrenceId(t.id),
      organizationId: ctx.org,
      farmId: t.farmId,
      plotId: t.plotId,
      assigneeId: t.assigneeId,
      title: t.title,
      kind: t.kind,
      lon: t.lon,
      lat: t.lat,
      prescription: t.prescription,
      workOrder: t.workOrder,
      dueDate: next,
      dueTime: t.dueTime,
      priority: t.priority,
      recurrence: t.recurrence,
      status: "open",
      checklist: serializeChecklist(resetChecklist(parseChecklist(t.checklist))),
      createdBy: t.createdBy,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      version: currentVersion,
    })
    .onConflictDoNothing();

/** Ciertas tareas se cierran solo con un registro que traiga foto y/o ubicación. */
function closeRequirementProblem(ctx: PushCtx, t: Task, row: Of<"tasks.status">["row"]): string | null {
  const need = row.status === "done" && t.status !== "done" ? closeRequirements(t.kind) : null;
  if (!need) return null;
  const rec = row.recordId ? ctx.records.get(row.recordId) : undefined;
  return closeProblem(
    need,
    rec && !rec.deletedAt && rec.organizationId === ctx.org ? rec : null,
    row.recordId ? (ctx.attachCount.get(`${row.recordId}:photo`) ?? 0) : 0,
  );
}

/** Cambio de estado de una tarea; al completar una recurrente nace la siguiente. */
export function tasksStatus(ctx: PushCtx, m: Of<"tasks.status">): void {
  const t = ctx.tasks.get(m.row.id);
  if (!t || t.organizationId !== ctx.org) return ctx.reject(m, "not_found");
  if (taskForbidden(ctx, t)) return ctx.reject(m, "forbidden");
  const problem = closeRequirementProblem(ctx, t, m.row);
  if (problem) return ctx.reject(m, "close_requirements", problem);
  // `done` gana sobre `open`.
  if (!(t.status === "done" && m.row.status === "open")) {
    const { now } = ctx;
    const done = m.row.status === "done";
    ctx.out.taskUpdates.push(
      updateTask(ctx, t, {
        status: m.row.status,
        completedAt: done ? (m.row.completedAt ?? now) : null,
        completedBy: done ? ctx.userId : null,
        recordId: m.row.recordId,
      }),
    );
    const next = done ? nextDueDate(t.dueDate, t.recurrence, localDate(m.row.completedAt ?? now, t.tz)) : null;
    if (next && t.status !== "done") ctx.out.taskUpdates.push(nextOccurrence(ctx, t, next));
    t.status = m.row.status;
  }
  ctx.accept(m, t.id);
}

/** Comentario en una tarea. */
export async function tasksComment(ctx: PushCtx, m: Of<"tasks.comment">): Promise<void> {
  const t = ctx.tasks.get(m.row.taskId);
  if (!t || t.organizationId !== ctx.org || t.deletedAt) return ctx.reject(m, "not_found");
  if (taskForbidden(ctx, t)) return ctx.reject(m, "forbidden");
  const list = parseTaskComments(t.comments);
  if (list.some((c) => c.id === m.row.id)) return ctx.accept(m, t.id);
  if (list.length >= LIMITS.tasks.maxComments) return ctx.reject(m, "invalid", "limit");
  ctx.taskAuthorName ??=
    (await ctx.db.select({ n: s.users.fullName }).from(s.users).where(eq(s.users.id, ctx.userId)).limit(1))[0]?.n ?? "";
  t.comments = JSON.stringify([...list, { id: m.row.id, userId: ctx.userId, name: ctx.taskAuthorName, at: ctx.now, text: m.row.text }]);
  ctx.out.taskUpdates.push(updateTask(ctx, t, { comments: t.comments }));
  ctx.accept(m, t.id);
}

/** Tilde de un ítem del checklist de una tarea. */
export function tasksCheck(ctx: PushCtx, m: Of<"tasks.check">): void {
  const t = ctx.tasks.get(m.row.id);
  if (!t || t.organizationId !== ctx.org) return ctx.reject(m, "not_found");
  if (taskForbidden(ctx, t)) return ctx.reject(m, "forbidden");
  // Cada tilde es un ítem: el último gana por ítem, y lo demás de la lista no se toca.
  const next = setChecklistItem(parseChecklist(t.checklist), m.row.itemId, m.row.done);
  if (!next) return ctx.reject(m, "invalid", "item");
  t.checklist = serializeChecklist(next);
  ctx.out.taskUpdates.push(updateTask(ctx, t, { checklist: t.checklist }));
  ctx.accept(m, t.id);
}
