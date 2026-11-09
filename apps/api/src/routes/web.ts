/** Consultas y edición para la web (y la ficha del lote en la app con red). */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { areaHa, bboxOf, validateShape, type Area } from "@yvy/geo";
import { CROPS, PLOT_KINDS, RECORD_KINDS, RECURRENCES, SEASONS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import {
  alertFeedback,
  deleteFarm,
  deletePlot,
  deletePoi,
  deleteTask,
  farmClimate,
  farmDetail,
  farmSummaries,
  listAlerts,
  listRecords,
  listTasks,
  plotNdvi,
  registerDevice,
  removeMember,
  updateFarm,
  updatePlot,
  updateTask,
} from "../db/queries";
import { parse, readJson } from "../lib/http";
import type { AppEnv } from "../types";

export const web = new Hono<AppEnv>();

const num = z.coerce.number().int().nonnegative();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Perfil y sesión actual. */
web.get("/me", async (c) => {
  const sdb = c.var.sdb;
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
  return c.json({ user, organization: org, role: sdb.auth.role, tilesBaseUrl: c.env.TILES_PUBLIC_URL });
});

web.get("/org/farms", async (c) => c.json(await farmSummaries(c.var.sdb)));
web.get("/org/farms/:id", async (c) => c.json(await farmDetail(c.var.sdb, c.req.param("id"))));
web.get("/org/farms/:id/climate", async (c) =>
  c.json(await farmClimate(c.var.sdb, c.req.param("id"), Number(c.req.query("days") ?? 90))),
);

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
      geometry: z.unknown().optional(),
    }),
    await readJson(c.req),
  );
  const { geometry, ...rest } = b;
  let geo = {};
  if (geometry !== undefined) {
    const err = validateShape(geometry);
    if (err) return c.json({ error: `geometría: ${err}` }, 400);
    geo = { geometry: JSON.stringify(geometry), ...bboxOf(geometry as Area), areaHa: areaHa(geometry as Area) };
  }
  await updatePlot(c.var.sdb, c.req.param("id"), { ...rest, ...geo });
  return c.json({ ok: true });
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
      recurrence: z.enum(RECURRENCES).optional(),
      status: z.enum(["open", "cancelled"]).optional(),
    }),
    await readJson(c.req),
  );
  await updateTask(c.var.sdb, c.req.param("id"), b);
  return c.json({ ok: true });
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
