/** Tareas: completar (con la siguiente ocurrencia), lista de verificación, comentarios y lecturas. */
import { isDueToday, LIMITS, localDate, newId, nextDueDate, nextOccurrenceId, parseChecklist, parseTaskComments, orderSchema, prescriptionSchema, resetChecklist, serializeChecklist, setChecklistItem, type Prescription, type WorkOrder } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { type Task, type Ctx, enqueue, fromRow } from "./core";

/** Marca la tarea hecha y, si se repite, crea la siguiente con el mismo id que creará el servidor. */
export function completeTask(db: Ctx, taskId: string, recordId: string | null): void {
  const t = db.sql.get<Record<string, unknown>>("SELECT * FROM tasks WHERE id = ?", [taskId]);
  if (!t) throw new Error("task_not_found");
  const task = fromRow<Task>(s.tasks, t);
  const ts = db.now();
  const tz =
    db.sql.get<{ timezone: string }>("SELECT timezone FROM farms WHERE id = ?", [task.farmId])?.timezone ??
    "America/Asuncion";
  db.sql.tx(() => {
    db.sql.run("UPDATE tasks SET status = 'done', completed_at = ?, record_id = ?, updated_at = ? WHERE id = ?", [
      ts,
      recordId,
      ts,
      taskId,
    ]);
    enqueue(db,
      { mutationId: newId(), kind: "tasks.status", row: { id: taskId, status: "done", completedAt: ts, recordId } },
      taskId,
    );
    const next = task.status !== "done" ? nextDueDate(task.dueDate, task.recurrence, localDate(ts, tz)) : null;
    if (next) {
      db.sql.run(
        `INSERT INTO tasks (id, organization_id, farm_id, plot_id, assignee_id, title, kind, lon, lat, due_date, due_time, priority, recurrence, status, prescription, created_by, created_at, updated_at, version, checklist, work_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, 0, ?, ?) ON CONFLICT(id) DO NOTHING`,
        [
          nextOccurrenceId(taskId),
          task.organizationId,
          task.farmId,
          task.plotId,
          task.assigneeId,
          task.title,
          task.kind,
          task.lon,
          task.lat,
          next,
          task.dueTime,
          task.priority,
          task.recurrence,
          task.prescription,
          task.createdBy,
          ts,
          ts,
          serializeChecklist(resetChecklist(parseChecklist(task.checklist))),
          task.workOrder,
        ],
      );
    }
  });
}

/** Todas las tareas (la base ya viene acotada a lo que la persona puede ver): pantallas de oficina. */
export function allTasks(db: Ctx): Task[] {
  return db.sql.all("SELECT * FROM tasks WHERE deleted_at IS NULL").map((r) => fromRow<Task>(s.tasks, r));
}

/** Tarea por id, o null si no existe o se borró. */
export function taskById(db: Ctx, id: string): Task | null {
  const r = db.sql.get<Record<string, unknown>>("SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL", [id]);
  return r ? fromRow<Task>(s.tasks, r) : null;
}

/** Tilda o destilda un ítem de la lista de verificación. Sin red: queda en el outbox. */
export function setTaskChecklistItem(db: Ctx, taskId: string, itemId: string, done: boolean): void {
  const task = taskById(db, taskId);
  if (!task) throw new Error("task_not_found");
  const next = setChecklistItem(parseChecklist(task.checklist), itemId, done);
  if (!next) throw new Error("item_not_found");
  const ts = db.now();
  db.sql.tx(() => {
    db.sql.run("UPDATE tasks SET checklist = ?, updated_at = ? WHERE id = ?", [serializeChecklist(next), ts, taskId]);
    enqueue(db, { mutationId: newId(), kind: "tasks.check", row: { id: taskId, itemId, done } }, taskId);
  });
}

/** Comenta una tarea. Se ve ya en el celular y viaja por el outbox. */
export function addTaskComment(db: Ctx, taskId: string, userId: string, authorName: string, text: string): void {
  const task = taskById(db, taskId);
  const body = text.trim().slice(0, LIMITS.tasks.maxCommentLength);
  if (!task || !body) throw new Error("task_not_found");
  const list = parseTaskComments(task.comments);
  if (list.length >= LIMITS.tasks.maxComments) throw new Error("comments_limit");
  const ts = db.now();
  const id = newId();
  db.sql.tx(() => {
    db.sql.run("UPDATE tasks SET comments = ?, updated_at = ? WHERE id = ?", [
      JSON.stringify([...list, { id, userId, name: authorName, at: ts, text: body }]),
      ts,
      taskId,
    ]);
    enqueue(db, { mutationId: newId(), kind: "tasks.comment", row: { id, taskId, text: body } }, taskId);
  });
}

/** Tareas del usuario que vencen hoy o antes, o que cerró hoy, por fecha y título. */
export function tasksToday(db: Ctx, userId: string, today = localDate(db.now())): Task[] {
  return db.sql
    .all("SELECT * FROM tasks WHERE assignee_id = ? AND deleted_at IS NULL ORDER BY due_date, title", [userId])
    .map((r) => fromRow<Task>(s.tasks, r))
    .filter((t) => isDueToday(t, today) || (t.status === "done" && localDate(t.completedAt ?? 0) === today));
}

/** Tareas abiertas de todo el equipo (las que bajó el servidor para este rol), para el resumen de oficina. */
export function openTasks(db: Ctx): Task[] {
  return db.sql
    .all("SELECT * FROM tasks WHERE status = 'open' AND deleted_at IS NULL ORDER BY due_date, title")
    .map((r) => fromRow<Task>(s.tasks, r));
}

/** Tareas abiertas con punto en el mapa, para dibujarlas y llevar a la persona ahí. */
export function taskPoints(db: Ctx, userId: string): { id: string; title: string; lon: number; lat: number }[] {
  return db.sql
    .all<{ id: string; title: string; lon: number; lat: number }>(
      "SELECT id, title, lon, lat FROM tasks WHERE assignee_id = ? AND status = 'open' AND deleted_at IS NULL AND lon IS NOT NULL AND lat IS NOT NULL",
      [userId],
    );
}

/** Tareas abiertas de un lote. */
export function openTasksOfPlot(db: Ctx, plotId: string): number {
  return db.sql.get<{ n: number }>("SELECT count(*) n FROM tasks WHERE plot_id = ? AND status = 'open' AND deleted_at IS NULL", [plotId])?.n ?? 0;
}

/** Tareas abiertas de un lote (ficha del lote), las que vencen antes primero. */
export function openTasksListOfPlot(db: Ctx, plotId: string, limit = 20): Task[] {
  return db.sql
    .all("SELECT * FROM tasks WHERE plot_id = ? AND status = 'open' AND deleted_at IS NULL ORDER BY due_date, title LIMIT ?", [plotId, limit])
    .map((r) => fromRow<Task>(s.tasks, r));
}

/** Receta de una tarea, ya validada; null si no tiene o está dañada. */
export function prescriptionOf(db: Ctx, taskId: string): Prescription | null {
  const r = db.sql.get<{ prescription: string | null }>("SELECT prescription FROM tasks WHERE id = ?", [taskId]);
  if (!r?.prescription) return null;
  try {
    const p = prescriptionSchema.safeParse(JSON.parse(r.prescription));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

/** Orden de trabajo de una tarea, ya validada; null si no tiene o está dañada. */
export function orderOf(db: Ctx, taskId: string): WorkOrder | null {
  const r = db.sql.get<{ work_order: string | null }>("SELECT work_order FROM tasks WHERE id = ?", [taskId]);
  if (!r?.work_order) return null;
  try {
    const p = orderSchema.safeParse(JSON.parse(r.work_order));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}
