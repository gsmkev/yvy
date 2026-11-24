/** Formularios, análisis por lote, registros, tareas y miembros. */
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { formConfigSchema, LIMITS, RECORD_KINDS, RECURRENCES, TASK_PRIORITIES } from "@yvy/shared";
import { addTaskComment, deletePoi, deleteTask, getFormConfig, saveFormConfig, farmAnalyses, analysisStatus, markAnalysisFailed, markAnalysisRequested, markHistoryFailed, markHistoryRequested, listRecords, listTasks, plotNdvi, removeMember, updateTask } from "../../db/queries";
import { parse, readJson, timeOfDay } from "../../lib/http";
import { dispatchJob, HISTORY_JOB } from "../../lib/dispatch";
import type { AppEnv } from "../../types";
import { isoDate, num } from "../schemas";
import { Hono } from "hono";

/** Rutas de formularios, análisis por lote, registros, tareas y miembros. */
export const routes = new Hono<AppEnv>();

/** Campos propios de los formularios. Leer: todo el equipo (el empleado los llena en la app). Editar: dueño y administrador. */
routes.get("/org/form-config", async (c) => c.json(await getFormConfig(c.var.sdb)));
routes.put("/org/form-config", async (c) => {
  const config = parse(formConfigSchema, await readJson(c.req));
  return c.json(await saveFormConfig(c.var.sdb, config));
});
/** Área quemada por lote tras un foco de fuego (job burned_area). */
routes.get("/org/farms/:id/burned", async (c) => c.json(await farmAnalyses(c.var.sdb, c.req.param("id"), "burned")));
/** Cambio de cobertura entre dos fechas, a pedido. */
routes.get("/org/farms/:id/cover-change", async (c) => {
  const id = c.req.param("id");
  return c.json({ ...(await farmAnalyses(c.var.sdb, id, "cover_change")), job: await analysisStatus(c.var.sdb, id, "cover_change") });
});
routes.post("/org/farms/:id/cover-change", async (c) => {
  const farmId = c.req.param("id");
  const day = isoDate;
  const b = parse(z.object({ from: day, to: day }), await readJson(c.req));
  const first = "2017-01-01";
  const today = new Date(c.var.sdb.now()).toISOString().slice(0, 10);
  if (b.from < first || b.to > today || Date.parse(b.to) - Date.parse(b.from) < 90 * 86_400_000)
    throw new HTTPException(400, { message: "Elegí dos fechas desde 2017, con al menos 3 meses de diferencia" });
  if (!(await markAnalysisRequested(c.var.sdb, farmId, "cover_change", b))) return c.json({ status: "processing", already: true }, 202);
  const res = await dispatchJob(c.env, "cover_change", farmId, b);
  if (res !== "sent") {
    await markAnalysisFailed(c.var.sdb, farmId, "cover_change");
    throw new HTTPException(503, { message: "No se pudo pedir el análisis: los jobs no están disponibles" });
  }
  return c.json({ status: "processing", already: false }, 202);
});
/** Pide el job s2_history (Sentinel-2 desde 2017) para la estancia. */
routes.post("/org/farms/:id/history", async (c) => {
  const farmId = c.req.param("id");
  if (!(await markHistoryRequested(c.var.sdb, farmId))) return c.json({ status: "processing", already: true }, 202);
  const res = await dispatchJob(c.env, HISTORY_JOB, farmId);
  if (res !== "sent") {
    await markHistoryFailed(c.var.sdb, farmId);
    throw new HTTPException(503, { message: "No se pudo pedir la historia: los jobs no están disponibles" });
  }
  return c.json({ status: "processing", already: false }, 202);
});
routes.get("/org/plots/:id/ndvi", async (c) => c.json(await plotNdvi(c.var.sdb, c.req.param("id"))));

routes.delete("/org/pois/:id", async (c) => {
  await deletePoi(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

routes.get("/org/records", async (c) => {
  const q = parse(
    z.object({
      farmId: z.string().optional(),
      plotId: z.string().optional(),
      authorId: z.string().optional(),
      kind: z.enum(RECORD_KINDS).optional(),
      from: num.optional(),
      to: num.optional(),
      cursorAt: num.optional(),
      cursorId: z.string().optional(),
      limit: num.optional(),
    }),
    c.req.query(),
  );
  const { cursorAt, cursorId, ...f } = q;
  return c.json(
    await listRecords(c.var.sdb, {
      ...f,
      cursor: cursorAt && cursorId ? { capturedAt: cursorAt, id: cursorId } : undefined,
    }),
  );
});

routes.get("/org/tasks", async (c) => {
  const q = parse(
    z.object({
      farmId: z.string().optional(),
      assigneeId: z.string().optional(),
      status: z.enum(["open", "done", "cancelled"]).optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
    }),
    c.req.query(),
  );
  const rows = await listTasks(c.var.sdb, q);
  return c.json(rows.map((r) => ({ ...r.task, assigneeName: r.assigneeName, plotName: r.plotName })));
});
routes.patch("/org/tasks/:id", async (c) => {
  const b = parse(
    z.object({
      title: z.string().trim().min(1).max(200).optional(),
      assigneeId: z.string().optional(),
      plotId: z.string().nullish(),
      kind: z.enum(RECORD_KINDS).nullish(),
      dueDate: isoDate.optional(),
      dueTime: timeOfDay.nullish(),
      priority: z.enum(TASK_PRIORITIES).optional(),
      recurrence: z.enum(RECURRENCES).optional(),
      status: z.enum(["open", "cancelled"]).optional(),
    }),
    await readJson(c.req),
  );
  await updateTask(c.var.sdb, c.req.param("id"), b);
  return c.json({ ok: true });
});
/** Comentario en la tarea. Lo puede hacer quien ve la tarea (el empleado solo en las suyas). */
routes.post("/org/tasks/:id/comments", async (c) => {
  const b = parse(z.object({ text: z.string().trim().min(1).max(LIMITS.tasks.maxCommentLength) }), await readJson(c.req));
  return c.json(await addTaskComment(c.var.sdb, c.req.param("id"), b.text), 201);
});
routes.delete("/org/tasks/:id", async (c) => {
  await deleteTask(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

routes.delete("/org/members/:userId", async (c) => {
  await removeMember(c.var.sdb, c.req.param("userId"));
  return c.json({ ok: true });
});
