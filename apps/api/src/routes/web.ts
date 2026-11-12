/** Consultas y edición para la web (y la ficha del lote en la app con red). */
import { Hono } from "hono";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { areaHa, bboxOf } from "@yvy/geo";
import { compareFarms, compareSeasons } from "../db/compare";
import { addComment, deleteComment, listComments } from "../db/comments";
import { alertSettingsSchema, formConfigSchema, referralCode, CROPS, FUNNEL_EVENTS, newId, notificationPrefsSchema, LIMITS, MAX_UA_PER_HA_LIMITS, sanitaryEventSchema, PLOT_KINDS, RECORD_KINDS, RECURRENCES, SEASONS, TASK_PRIORITIES } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import {
  addTaskComment,
  alertFeedback,
  deleteFarm,
  deletePlot,
  deletePoi,
  createShareLink,
  deleteTask,
  farmClimate,
  farmDetail,
  farmForecast,
  farmEudr,
  getFormConfig,
  saveFormConfig,
  farmAnalyses,
  analysisStatus,
  markAnalysisFailed,
  markAnalysisRequested,
  farmHistoryStatus,
  markHistoryFailed,
  markHistoryRequested,
  plotVigorHistory,
  farmProblemAreas,
  farmRiskReport,
  farmSummaries,
  getAlertSettings,
  getNotificationPrefs,
  listAlerts,
  listRecords,
  listShareLinks,
  listTasks,
  mergePlots,
  listAudit,
  ownerDashboard,
  plotGeometryWarnings,
  plotNdvi,
  registerDevice,
  saveAlertSettings,
  saveNotificationPrefs,
  splitPlot,
  removeMember,
  revokeShareLink,
  updateFarm,
  updatePlot,
  updateTask,
} from "../db/queries";
import { farmStockSummary, saveLivestockSettings } from "../db/livestock";
import { createSanitaryEvent, deleteSanitaryEvent, listSanitaryEvents } from "../db/sanitary";
import { clientsOverview } from "../db/clients";
import { createLine, deleteLine, listFarmLines, updateLine } from "../db/lines";
import { parse, readJson, timeOfDay } from "../lib/http";
import { plotArea } from "./org";
import { dispatchJob, HISTORY_JOB } from "../lib/dispatch";
import { touchActivity } from "../auth/plan";
import type { AppEnv } from "../types";

export const web = new Hono<AppEnv>();

const num = z.coerce.number().int().nonnegative();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Perfil y sesión actual. */
web.get("/me", async (c) => {
  const sdb = c.var.sdb;
  if (!sdb.auth.readOnly) await touchActivity(sdb.db, c.var.auth);
  const [user] = await sdb.db
    .select({
      id: s.users.id,
      fullName: s.users.fullName,
      email: s.users.email,
      phone: s.users.phone,
      locale: s.users.locale,
    })
    .from(s.users)
    .where(eq(s.users.id, sdb.auth.userId))
    .limit(1);
  const [org] = await sdb.db
    .select({
      id: s.organizations.id,
      name: s.organizations.name,
      plan: s.organizations.plan,
      trialEndsAt: s.organizations.trialEndsAt,
    })
    .from(s.organizations)
    .where(eq(s.organizations.id, sdb.auth.orgId))
    .limit(1);
  const admins = (c.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());
  return c.json({
    user,
    organization: org,
    role: sdb.auth.role,
    tilesBaseUrl: c.env.TILES_PUBLIC_URL,
    isStaff: !!user?.email && admins.includes(user.email.toLowerCase()),
    demo: org?.plan === "demo",
    support: !!sdb.auth.readOnly,
  });
});

/** V-05: código de referido del agrónomo (null si la persona no es agrónomo en ninguna de sus organizaciones). */
web.get("/me/referral", async (c) => {
  const [m] = await c.var.sdb.db
    .select({ id: s.memberships.id })
    .from(s.memberships)
    .where(
      and(
        eq(s.memberships.userId, c.var.sdb.auth.userId),
        eq(s.memberships.role, "agronomist"),
        eq(s.memberships.status, "active"),
        isNull(s.memberships.deletedAt),
      ),
    )
    .limit(1);
  return c.json({ code: m ? referralCode(c.var.sdb.auth.userId) : null });
});

/** U-29: qué avisos le llegan al usuario, por qué canal y en qué horario. Valen para todas sus organizaciones. */
web.get("/me/notification-prefs", async (c) => c.json(await getNotificationPrefs(c.var.sdb)));
web.put("/me/notification-prefs", async (c) => {
  const prefs = parse(notificationPrefsSchema, await readJson(c.req));
  await saveNotificationPrefs(c.var.sdb, prefs);
  return c.json(await getNotificationPrefs(c.var.sdb));
});

/**
 * P-03: evento de uso del cliente (ej. "view:tareas"). Se muestrea y tiene tope por usuario; los pasos del embudo
 * los escribe solo el servidor, así que esos nombres se rechazan acá.
 */
web.post("/events", async (c) => {
  const { name } = parse(
    z.object({
      name: z
        .string()
        .regex(/^[a-z0-9_.:-]+$/)
        .max(LIMITS.events.nameLength),
    }),
    await readJson(c.req),
  );
  if ((FUNNEL_EVENTS as readonly string[]).includes(name)) throw new HTTPException(400, { message: "Nombre reservado" });
  if (Math.random() >= LIMITS.events.sampleRate) return c.json({ recorded: false }, 202);
  const { userId, orgId } = c.var.auth;
  const now = Date.now();
  const [{ n }] = (await c.var.sdb.db
    .select({ n: sql<number>`count(*)` })
    .from(s.events)
    .where(and(eq(s.events.userId, userId), gte(s.events.ts, now - 60_000)))) as [{ n: number }];
  if (n >= LIMITS.events.perUserPerMinute) throw new HTTPException(429, { message: "Demasiados eventos" });
  await c.var.sdb.db.insert(s.events).values({ id: newId(), name, userId, organizationId: orgId, ts: now });
  return c.json({ recorded: true }, 202);
});

/** K-02: estancias y avisos de todas las organizaciones de la persona (vista del agrónomo). */
web.get("/me/clients", async (c) =>
  // Una sesión de soporte ve solo la organización que se pidió, no las otras de la misma persona.
  c.json(
    await clientsOverview(c.var.sdb.db, c.var.auth.userId, {
      onlyOrgId: c.var.auth.readOnly ? c.var.auth.orgId : undefined,
    }),
  ),
);
web.get("/org/dashboard", async (c) => c.json(await ownerDashboard(c.var.sdb)));
/** T-08: comentarios y menciones en un registro. */
web.get("/org/records/:id/comments", async (c) => c.json(await listComments(c.var.sdb, c.req.param("id"))));
web.post("/org/records/:id/comments", async (c) => {
  const b = parse(
    z.object({
      body: z.string().trim().min(1).max(LIMITS.comments.maxLength),
      mentions: z.array(z.string().uuid()).max(LIMITS.comments.maxMentions).default([]),
    }),
    await readJson(c.req),
  );
  return c.json(await addComment(c.var.sdb, c.req.param("id"), b.body, b.mentions), 201);
});
web.delete("/org/comments/:id", async (c) => {
  await deleteComment(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});
/** R-07: comparación entre estancias y entre campañas. */
web.get("/org/compare/farms", async (c) => c.json(await compareFarms(c.var.sdb)));
web.get("/org/compare/seasons", async (c) => c.json(await compareSeasons(c.var.sdb)));
web.get("/org/audit", async (c) =>
  c.json(
    await listAudit(c.var.sdb, {
      entity: c.req.query("entity") || undefined,
      before: Number(c.req.query("before")) || undefined,
    }),
  ),
);
web.get("/org/farms", async (c) => c.json(await farmSummaries(c.var.sdb)));
web.get("/org/farms/:id", async (c) => c.json(await farmDetail(c.var.sdb, c.req.param("id"))));
web.get("/org/farms/:id/climate", async (c) =>
  c.json(await farmClimate(c.var.sdb, c.req.param("id"), Math.min(Math.max(Number(c.req.query("days")) || 90, 1), 400))),
);

web.get("/org/farms/:id/forecast", async (c) => c.json(await farmForecast(c.var.sdb, c.req.param("id"))));

web.get("/org/farms/:id/problem-areas", async (c) =>
  c.json(await farmProblemAreas(c.var.sdb, c.req.param("id"))),
);
web.get("/org/farms/:id/eudr", async (c) => c.json(await farmEudr(c.var.sdb, c.req.param("id"))));
web.get("/org/farms/:id/risk",async (c) => c.json(await farmRiskReport(c.var.sdb, c.req.param("id"))));

web.patch("/org/farms/:id", async (c) => {
  const b = parse(
    z.object({
      name: z.string().trim().min(1).max(120).optional(),
      department: z.string().max(60).nullish(),
      district: z.string().max(60).nullish(),
    }),
    await readJson(c.req),
  );
  await updateFarm(c.var.sdb, c.req.param("id"), b);
  return c.json({ ok: true });
});
web.delete("/org/farms/:id", async (c) => {
  await deleteFarm(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

web.patch("/org/plots/:id", async (c) => {
  const b = parse(
    z.object({
      name: z.string().trim().min(1).max(120).optional(),
      kind: z.enum(PLOT_KINDS).optional(),
      crop: z.enum(CROPS).nullish(),
      season: z.enum(SEASONS).nullish(),
      sowingDate: isoDate.nullish(),
      pastureType: z.string().max(60).nullish(),
      color: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .nullish(),
      geometry: plotArea.optional(),
    }),
    await readJson(c.req),
  );
  const { geometry, ...rest } = b;
  let geo = {};
  if (geometry !== undefined) {
    geo = { geometry: JSON.stringify(geometry), ...bboxOf(geometry), areaHa: areaHa(geometry) };
  }
  await updatePlot(c.var.sdb, c.req.param("id"), { ...rest, ...geo });
  if (!geometry) return c.json({ ok: true });
  // M-02: cambió la forma; devuelve la superficie nueva y avisos de superposición o de lote fuera del perímetro.
  return c.json({
    ok: true,
    areaHa: areaHa(geometry),
    warnings: await plotGeometryWarnings(c.var.sdb, c.req.param("id"), geometry),
  });
});
web.delete("/org/plots/:id", async (c) => {
  await deletePlot(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});
/** M-20: líneas del mapa (alambrados, caminos, cañerías). */
const lineGeometry = z.unknown().transform((g, ctx) => {
  const c = (g as { type?: string; coordinates?: unknown } | null)?.coordinates;
  const ok =
    (g as { type?: string } | null)?.type === "LineString" &&
    Array.isArray(c) &&
    c.length >= 2 &&
    c.length <= LIMITS.geometry.maxLineVertices &&
    c.every(
      (p) =>
        Array.isArray(p) &&
        typeof p[0] === "number" &&
        typeof p[1] === "number" &&
        Math.abs(p[0]) <= 180 &&
        Math.abs(p[1]) <= 90,
    );
  if (!ok) {
    ctx.addIssue({ code: "custom", message: "geometría: línea inválida" });
    return z.NEVER;
  }
  return { type: "LineString" as const, coordinates: (c as number[][]).map((p) => [p[0]!, p[1]!]) };
});
web.get("/org/farms/:id/lines", async (c) => c.json(await listFarmLines(c.var.sdb, c.req.param("id"))));
web.post("/org/farms/:id/lines", async (c) => {
  const b = parse(
    z.object({ kind: z.enum(s.LINE_KINDS), name: z.string().trim().min(1).max(120), geometry: lineGeometry }),
    await readJson(c.req),
  );
  return c.json(await createLine(c.var.sdb, c.req.param("id"), b), 201);
});
web.patch("/org/lines/:id", async (c) => {
  const b = parse(
    z.object({ kind: z.enum(s.LINE_KINDS).optional(), name: z.string().trim().min(1).max(120).optional() }),
    await readJson(c.req),
  );
  await updateLine(c.var.sdb, c.req.param("id"), b);
  return c.json({ ok: true });
});
web.delete("/org/lines/:id", async (c) => {
  await deleteLine(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

/** M-05: dividir un lote en dos. Los polígonos los calcula el cliente; el servidor valida forma y superficie. */
web.post("/org/plots/:id/split", async (c) => {
  const b = parse(
    z.object({
      parts: z.tuple([
        z.object({ name: z.string().trim().min(1).max(120), geometry: plotArea }),
        z.object({ name: z.string().trim().min(1).max(120), geometry: plotArea }),
      ]),
    }),
    await readJson(c.req),
  );
  const res = await splitPlot(
    c.var.sdb,
    c.req.param("id"),
    b.parts.map((p) => ({ name: p.name, geometry: JSON.stringify(p.geometry), ...bboxOf(p.geometry), areaHa: areaHa(p.geometry) })),
  );
  return c.json(res, 201);
});
/** M-05: unir dos lotes contiguos de la misma estancia en uno. */
web.post("/org/plots/merge", async (c) => {
  const b = parse(
    z.object({
      ids: z.tuple([z.string().min(1), z.string().min(1)]).refine(([x, y]) => x !== y),
      name: z.string().trim().min(1).max(120),
      geometry: plotArea,
    }),
    await readJson(c.req),
  );
  const res = await mergePlots(c.var.sdb, b.ids, {
    name: b.name,
    geometry: JSON.stringify(b.geometry),
    ...bboxOf(b.geometry),
    areaHa: areaHa(b.geometry),
  });
  return c.json(res, 201);
});
web.get("/org/plots/:id/vigor-history", async (c) => c.json(await plotVigorHistory(c.var.sdb, c.req.param("id"))));
web.get("/org/farms/:id/history", async (c) => c.json(await farmHistoryStatus(c.var.sdb, c.req.param("id"))));
/** F-14: campos propios de los formularios. Leer: todo el equipo (el empleado los llena en la app). Editar: dueño y administrador. */
web.get("/org/form-config", async (c) => c.json(await getFormConfig(c.var.sdb)));
web.put("/org/form-config", async (c) => {
  const config = parse(formConfigSchema, await readJson(c.req));
  return c.json(await saveFormConfig(c.var.sdb, config));
});
/** S-20: área quemada por lote tras un foco de fuego (job burned_area). */
web.get("/org/farms/:id/burned", async (c) => c.json(await farmAnalyses(c.var.sdb, c.req.param("id"), "burned")));
/** S-31: cambio de cobertura entre dos fechas, a pedido. */
web.get("/org/farms/:id/cover-change", async (c) => {
  const id = c.req.param("id");
  return c.json({ ...(await farmAnalyses(c.var.sdb, id, "cover_change")), job: await analysisStatus(c.var.sdb, id, "cover_change") });
});
web.post("/org/farms/:id/cover-change", async (c) => {
  const farmId = c.req.param("id");
  const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
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
/** S-03: pide el job s2_history (Sentinel-2 desde 2017) para la estancia. */
web.post("/org/farms/:id/history", async (c) => {
  const farmId = c.req.param("id");
  if (!(await markHistoryRequested(c.var.sdb, farmId))) return c.json({ status: "processing", already: true }, 202);
  const res = await dispatchJob(c.env, HISTORY_JOB, farmId);
  if (res !== "sent") {
    await markHistoryFailed(c.var.sdb, farmId);
    throw new HTTPException(503, { message: "No se pudo pedir la historia: los jobs no están disponibles" });
  }
  return c.json({ status: "processing", already: false }, 202);
});
web.get("/org/plots/:id/ndvi", async (c) => c.json(await plotNdvi(c.var.sdb, c.req.param("id"))));

web.delete("/org/pois/:id", async (c) => {
  await deletePoi(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

web.get("/org/records", async (c) => {
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

web.get("/org/tasks", async (c) => {
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
web.patch("/org/tasks/:id", async (c) => {
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
/** T-02: comentario en la tarea. Lo puede hacer quien ve la tarea (el empleado solo en las suyas). */
web.post("/org/tasks/:id/comments", async (c) => {
  const b = parse(z.object({ text: z.string().trim().min(1).max(LIMITS.tasks.maxCommentLength) }), await readJson(c.req));
  return c.json(await addTaskComment(c.var.sdb, c.req.param("id"), b.text), 201);
});
web.delete("/org/tasks/:id", async (c) => {
  await deleteTask(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

web.delete("/org/members/:userId", async (c) => {
  await removeMember(c.var.sdb, c.req.param("userId"));
  return c.json({ ok: true });
});

web.get("/org/alerts", async (c) => {
  const rows = await listAlerts(c.var.sdb, { farmId: c.req.query("farmId"), active: c.req.query("active") === "1" });
  return c.json(
    rows.map((r) => ({
      ...r.alert,
      plotIds: JSON.parse(r.alert.plotIds),
      details: JSON.parse(r.alert.details),
      useful: r.useful === null ? null : !!r.useful,
    })),
  );
});
web.get("/org/farms/:id/share-links", async (c) => c.json(await listShareLinks(c.var.sdb, c.req.param("id"))));
web.post("/org/farms/:id/share-links", async (c) => {
  const b = parse(z.object({ days: z.number().int() }), await readJson(c.req));
  return c.json(await createShareLink(c.var.sdb, c.req.param("id"), b.days), 201);
});
web.delete("/org/share-links/:id", async (c) => {
  await revokeShareLink(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});
// Hacienda calculada (G-03) y carga máxima configurable.
web.get("/org/farms/:id/stock", async (c) => c.json(await farmStockSummary(c.var.sdb, c.req.param("id"))));
web.put("/org/farms/:id/livestock-settings", async (c) => {
  const b = parse(
    z.object({ maxUaPerHa: z.number().min(MAX_UA_PER_HA_LIMITS.min).max(MAX_UA_PER_HA_LIMITS.max) }),
    await readJson(c.req),
  );
  await saveLivestockSettings(c.var.sdb, c.req.param("id"), b.maxUaPerHa);
  return c.json({ ok: true });
});

// Calendario sanitario (G-10).
web.get("/org/sanitary-events", async (c) => {
  const q = parse(
    z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), farmId: z.string().uuid().optional() }),
    c.req.query(),
  );
  return c.json(await listSanitaryEvents(c.var.sdb, q.month, q.farmId));
});
web.post("/org/sanitary-events", async (c) => {
  const b = parse(sanitaryEventSchema, await readJson(c.req));
  return c.json(await createSanitaryEvent(c.var.sdb, b), 201);
});
web.delete("/org/sanitary-events/:id", async (c) => {
  await deleteSanitaryEvent(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

web.get("/org/farms/:id/alert-settings", async (c) => c.json(await getAlertSettings(c.var.sdb, c.req.param("id"))));
web.put("/org/farms/:id/alert-settings", async (c) => {
  const b = parse(alertSettingsSchema, await readJson(c.req));
  await saveAlertSettings(c.var.sdb, c.req.param("id"), b);
  return c.json({ ok: true });
});
web.post("/org/alerts/:id/feedback", async (c) => {
  const b = parse(z.object({ useful: z.boolean(), comment: z.string().max(1000).nullish() }), await readJson(c.req));
  await alertFeedback(c.var.sdb, c.req.param("id"), b.useful, b.comment ?? null);
  return c.json({ ok: true });
});

web.post("/devices", async (c) => {
  const b = parse(
    z.object({
      id: z.string().min(1).max(64),
      platform: z.enum(["android", "ios", "web"]),
      appVersion: z.string().max(40).nullish(),
      pushToken: z.string().max(200).nullish(),
    }),
    await readJson(c.req),
  );
  await registerDevice(c.var.sdb, {
    id: b.id,
    platform: b.platform,
    appVersion: b.appVersion ?? null,
    pushToken: b.pushToken ?? null,
  });
  return c.json({ ok: true });
});
