/** Consultas y edición para la web (y la ficha del lote en la app con red). */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { areaHa, bboxOf } from "@yvy/geo";
import { alertSettingsSchema, CROPS, notificationPrefsSchema, LIMITS, MAX_UA_PER_HA_LIMITS, sanitaryEventSchema, PLOT_KINDS, RECORD_KINDS, RECURRENCES, SEASONS, TASK_PRIORITIES } from "@yvy/shared";
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
  farmProblemAreas,
  farmRiskReport,
  farmSummaries,
  getAlertSettings,
  getNotificationPrefs,
  listAlerts,
  listRecords,
  listShareLinks,
  listTasks,
  plotGeometryWarnings,
  plotNdvi,
  registerDevice,
  saveAlertSettings,
  saveNotificationPrefs,
  removeMember,
  revokeShareLink,
  updateFarm,
  updatePlot,
  updateTask,
} from "../db/queries";
import { farmStockSummary, saveLivestockSettings } from "../db/livestock";
import { createSanitaryEvent, deleteSanitaryEvent, listSanitaryEvents } from "../db/sanitary";
import { parse, readJson, timeOfDay } from "../lib/http";
import { plotArea } from "./org";
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

/** U-29: qué avisos le llegan al usuario, por qué canal y en qué horario. Valen para todas sus organizaciones. */
web.get("/me/notification-prefs", async (c) => c.json(await getNotificationPrefs(c.var.sdb)));
web.put("/me/notification-prefs", async (c) => {
  const prefs = parse(notificationPrefsSchema, await readJson(c.req));
  await saveNotificationPrefs(c.var.sdb, prefs);
  return c.json(await getNotificationPrefs(c.var.sdb));
});

web.get("/org/farms", async (c) => c.json(await farmSummaries(c.var.sdb)));
web.get("/org/farms/:id", async (c) => c.json(await farmDetail(c.var.sdb, c.req.param("id"))));
web.get("/org/farms/:id/climate", async (c) =>
  c.json(await farmClimate(c.var.sdb, c.req.param("id"), Math.min(Math.max(Number(c.req.query("days")) || 90, 1), 400))),
);

web.get("/org/farms/:id/forecast", async (c) => c.json(await farmForecast(c.var.sdb, c.req.param("id"))));

web.get("/org/farms/:id/problem-areas", async (c) =>
  c.json(await farmProblemAreas(c.var.sdb, c.req.param("id"))),
);
web.get("/org/farms/:id/risk", async (c) => c.json(await farmRiskReport(c.var.sdb, c.req.param("id"))));

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
