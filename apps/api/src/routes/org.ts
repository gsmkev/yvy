/** Gestión desde la web: miembros, asignaciones, estancias, lotes, puntos de interés y tareas. */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { areaHa, bboxOf, centroidOf, checkPlots, validateShape, type Area } from "@yvy/geo";
import { WEBHOOK_EVENTS, CROPS, doseText, FARM_ACCESS_LEVELS, isWeakPin, LIMITS, PIN_LENGTH, PIN_REGEX, phoneKey, newChecklist, prescriptionSchema, serializeChecklist, t, PLOT_KINDS, TASK_PRIORITIES, POI_KINDS, RECORD_KINDS, RECURRENCES, ROLES, SEASONS } from "@yvy/shared";
import { can } from "../db/scoped";
import { randomDigits, randomToken } from "../lib/crypto";
import { createApiToken, listApiTokens, revokeApiToken } from "../db/api-tokens";
import { createWebhook, deleteWebhook, listWebhooks, pingMessage, updateWebhook } from "../db/webhooks";
import { getSecurity, setRequireAdminTotp } from "../db/security";
import { createSchedule, deleteSchedule, listSchedules } from "../db/schedules";
import { dispatchNewFarm, inBackground } from "../lib/dispatch";
import { hashPin } from "../lib/pin";
import { sendEmail } from "../lib/email";
import { parse, readJson, timeOfDay } from "../lib/http";
import type { AppEnv } from "../types";

export const org = new Hono<AppEnv>();

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Quita la altura (Z) de cada posición: MapLibre y Python esperan 2D. */
const to2D = (v: unknown): unknown => (Array.isArray(v) ? (typeof v[0] === "number" ? v.slice(0, 2) : v.map(to2D)) : v);

const countVertices = (v: unknown): number =>
  Array.isArray(v) ? (typeof v[0] === "number" ? 1 : v.reduce((n: number, x) => n + countVertices(x), 0)) : 0;

/** Validación barata de la geometría (el cliente ya validó autointersecciones con Turf). */
const areaWith = (check: (ha: number) => string | null) =>
  z.unknown().transform((g, ctx) => {
    const err = validateShape(g);
    if (err) {
      ctx.addIssue({ code: "custom", message: `geometría: ${err}` });
      return z.NEVER;
    }
    const raw = g as { type: Area["type"]; coordinates: unknown };
    if (countVertices(raw.coordinates) > LIMITS.geometry.maxVertices) {
      ctx.addIssue({ code: "custom", message: t("ui.geomTooDetailed", { max: LIMITS.geometry.maxVertices }) });
      return z.NEVER;
    }
    const flat = { type: raw.type, coordinates: to2D(raw.coordinates) } as Area;
    const msg = check(areaHa(flat));
    if (msg) {
      ctx.addIssue({ code: "custom", message: msg });
      return z.NEVER;
    }
    return flat;
  });

export const farmArea = areaWith((ha) =>
  ha > LIMITS.geometry.maxFarmHa ? t("ui.farmTooBig", { max: LIMITS.geometry.maxFarmHa }) : null,
);
export const plotArea = areaWith((ha) =>
  ha < LIMITS.geometry.minPlotHa
    ? t("ui.plotTooSmall", { min: String(LIMITS.geometry.minPlotHa).replace(".", ",") })
    : null,
);

const describe = (g: Area) => ({ geometry: JSON.stringify(g), ...bboxOf(g), areaHa: areaHa(g) });

/** P-09: registra el pedido de baja y avisa al equipo. No borra nada. */
org.post("/delete-request", async (c) => {
  const res = await c.var.sdb.requestDeletion();
  if (res.created && c.env.OPS_EMAIL) {
    await sendEmail(
      c.env,
      c.env.OPS_EMAIL,
      `Pedido de baja: ${res.organizationName}`,
      `${res.requester} pidió la baja de la organización "${res.organizationName}" (${c.var.auth.orgId}). Pedido ${res.id}.`,
    ).catch((e) => console.error("delete-request email", e));
  }
  return c.json({ ok: true, requestId: res.id }, res.created ? 201 : 200);
});

org.get("/members", async (c) => c.json(await c.var.sdb.listMembers()));

org.post("/members", async (c) => {
  const body = parse(
    z.object({
      fullName: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email().nullish(),
      phone: z.string().trim().max(30).nullish(),
      role: z.enum(ROLES),
    }),
    await readJson(c.req),
  );
  return c.json(await c.var.sdb.addMember({ ...body, email: body.email ?? null, phone: body.phone ?? null }), 201);
});

/**
 * F-24: PIN de ingreso del empleado. Sin `pin` en el cuerpo el servidor genera uno al azar y lo devuelve una sola vez
 * (después solo queda el hash). El teléfono sale del cuerpo o de la ficha del empleado.
 */
org.put("/members/:userId/pin", async (c) => {
  const body = parse(
    z.object({ pin: z.string().regex(PIN_REGEX, "El PIN tiene 6 dígitos").optional(), phone: z.string().trim().max(30).optional() }),
    await readJson(c.req),
  );
  const sdb = c.var.sdb;
  sdb.require(can.manageWorkers, "Solo dueño o administrador gestionan el PIN de los empleados");
  const userId = c.req.param("userId");
  const phone = body.phone ?? (await sdb.memberPhone(userId));
  const key = phone ? phoneKey(phone) : null;
  if (!phone || !key) throw new HTTPException(400, { message: t("app.pinNeedsPhone") });
  if (body.pin && isWeakPin(body.pin)) throw new HTTPException(400, { message: t("app.pinTooWeak") });
  let pin = body.pin;
  while (!pin || isWeakPin(pin)) pin = randomDigits(PIN_LENGTH);
  const salt = randomToken(16);
  const res = await sdb.setMemberPin(userId, { phone, phoneKey: key, salt, pinHash: await hashPin(c.env.JWT_SECRET, salt, pin) });
  if (res === "phone_taken") throw new HTTPException(409, { message: t("app.pinPhoneTaken") });
  return c.json({ ok: true, pin: body.pin ? undefined : pin });
});

org.delete("/members/:userId/pin", async (c) => {
  await c.var.sdb.clearMemberPin(c.req.param("userId"));
  return c.json({ ok: true });
});

/** T-09 / K-05: estancias de cada supervisor, administrador o agrónomo (solo el dueño). */
org.get("/farm-access", async (c) => c.json(await c.var.sdb.listFarmAccess()));

/** R-10: informes programados por email a terceros. */
org.get("/report-schedules", async (c) => c.json(await listSchedules(c.var.sdb)));
org.post("/report-schedules", async (c) => {
  const b = parse(
    z.object({
      farmId: uuid.nullish(),
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email().max(254),
      frequency: z.enum(["weekly", "monthly"]),
    }),
    await readJson(c.req),
  );
  return c.json(await createSchedule(c.var.sdb, { ...b, farmId: b.farmId ?? null }), 201);
});
org.delete("/report-schedules/:id", async (c) => {
  await deleteSchedule(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

/** I-01: tokens de la API pública (solo el dueño). El token se muestra una sola vez al crearlo. */
org.get("/api-tokens", async (c) => c.json(await listApiTokens(c.var.sdb)));
org.post("/api-tokens", async (c) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(80) }), await readJson(c.req));
  return c.json(await createApiToken(c.var.sdb, b.name), 201);
});
org.delete("/api-tokens/:id", async (c) => {
  await revokeApiToken(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

/** I-02: webhooks de la organización (dueño y administrador). El secreto de firma se muestra una sola vez. */
const webhookEvents = z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length);
org.get("/webhooks", async (c) => c.json(await listWebhooks(c.var.sdb)));
org.post("/webhooks", async (c) => {
  const b = parse(z.object({ url: z.string().trim().max(300), events: webhookEvents }), await readJson(c.req));
  return c.json(await createWebhook(c.env, c.var.sdb, b.url, b.events), 201);
});
org.patch("/webhooks/:id", async (c) => {
  const b = parse(z.object({ enabled: z.boolean().optional(), events: webhookEvents.optional() }), await readJson(c.req));
  await updateWebhook(c.var.sdb, c.req.param("id"), b);
  return c.json({ ok: true });
});
org.delete("/webhooks/:id", async (c) => {
  await deleteWebhook(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});
/** Manda un evento de prueba por la cola, para ver el estado en el panel. */
org.post("/webhooks/:id/test", async (c) => {
  await c.env.JOBS.send(await pingMessage(c.var.sdb, c.req.param("id")));
  return c.json({ ok: true }, 202);
});

/** P-08: el dueño exige segundo factor a los administradores. */
org.get("/security", async (c) => c.json(await getSecurity(c.var.sdb)));
org.put("/security", async (c) => {
  const b = parse(z.object({ requireAdminTotp: z.boolean() }), await readJson(c.req));
  await setRequireAdminTotp(c.var.sdb, b.requireAdminTotp);
  return c.json({ ok: true });
});

org.put("/members/:userId/farms", async (c) => {
  const body = parse(
    z.object({ farms: z.array(z.object({ farmId: uuid, level: z.enum(FARM_ACCESS_LEVELS).default("edit") })).max(200) }),
    await readJson(c.req),
  );
  await c.var.sdb.setFarmAccess(c.req.param("userId"), body.farms);
  return c.json({ ok: true });
});

org.put("/members/:userId/plots", async (c) => {
  const body = parse(z.object({ plotIds: z.array(uuid).max(500) }), await readJson(c.req));
  await c.var.sdb.setAssignments(c.req.param("userId"), body.plotIds);
  return c.json({ ok: true });
});

org.post("/farms", async (c) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(1).max(120),
      department: z.string().max(60).nullish(),
      district: z.string().max(60).nullish(),
      geometry: farmArea,
    }),
    await readJson(c.req),
  );
  const { lon, lat } = centroidOf(body.geometry);
  const res = await c.var.sdb.createFarm({
    name: body.name,
    department: body.department ?? null,
    district: body.district ?? null,
    ...describe(body.geometry),
    centroidLon: lon,
    centroidLat: lat,
  });
  // M-01/S-02: mapa base, 6 meses de historia y climatología al instante, sin demorar la respuesta
  await inBackground(c, dispatchNewFarm(c.env, res.id));
  return c.json(res, 201);
});

const plotInput = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(PLOT_KINDS),
  geometry: plotArea,
  crop: z.enum(CROPS).nullish(),
  season: z.enum(SEASONS).nullish(),
  sowingDate: isoDate.nullish(),
  pastureType: z.string().max(60).nullish(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullish(),
});

/** Alta de uno o varios lotes (importación KML/KMZ/GeoJSON/SHP parseada en el navegador). */
org.post("/farms/:farmId/plots", async (c) => {
  const body = parse(z.object({ plots: z.array(plotInput).min(1).max(40) }), await readJson(c.req));
  const farmId = c.req.param("farmId");
  // Primeros lotes de la estancia: la historia de vigor se calcula por lote, así que se vuelve a pedir (S-01)
  const firstPlots = (await c.var.sdb.countPlots(farmId)) === 0;
  const res = await c.var.sdb.createPlots(
    farmId,
    body.plots.map((p) => ({
      name: p.name,
      kind: p.kind,
      ...describe(p.geometry),
      crop: p.kind === "crop" ? (p.crop ?? null) : null,
      season: p.kind === "crop" ? (p.season ?? null) : null,
      sowingDate: p.sowingDate ?? null,
      pastureType: p.kind === "pasture" ? (p.pastureType ?? null) : null,
      color: p.color ?? null,
    })),
  );
  if (firstPlots) await inBackground(c, dispatchNewFarm(c.env, farmId));
  // Avisos no bloqueantes (M-10). Presupuesto de CPU: prefiltro por bbox y como máximo 12 recortes exactos.
  const warnings = checkPlots(
    body.plots.map((p) => p.geometry),
    JSON.parse(res.farmGeometry) as Area,
    { maxExact: 12 },
  ).map((w) => ({
    kind: w.kind,
    plot: w.a,
    ...(w.b !== undefined ? { other: w.b } : {}),
    ratio: Math.round(w.ratio * 1000) / 1000,
  }));
  return c.json({ ids: res.ids, warnings }, 201);
});

org.post("/farms/:farmId/pois", async (c) => {
  const body = parse(
    z.object({
      kind: z.enum(POI_KINDS),
      name: z.string().trim().min(1).max(120),
      lon: z.number().min(-180).max(180),
      lat: z.number().min(-90).max(90),
    }),
    await readJson(c.req),
  );
  return c.json(await c.var.sdb.createPoi({ farmId: c.req.param("farmId"), ...body }), 201);
});

/** A-11: receta del agrónomo → una tarea de aplicación por lote para el empleado, con la receta adentro. */
org.post("/prescriptions", async (c) => {
  const body = parse(
    z.object({
      farmId: uuid,
      plotIds: z.array(uuid).min(1).max(40),
      assigneeId: z.string(),
      dueDate: isoDate,
      prescription: prescriptionSchema,
    }),
    await readJson(c.req),
  );
  const names = body.prescription.products.map(doseText).join(", ");
  const res = await c.var.sdb.createPrescription({
    farmId: body.farmId,
    plotIds: body.plotIds,
    assigneeId: body.assigneeId,
    dueDate: body.dueDate,
    title: `${t("recordKinds.application")}: ${names}`.slice(0, 200),
    prescription: JSON.stringify(body.prescription),
  });
  return c.json(res, 201);
});

org.post("/tasks", async (c) => {
  const body = parse(
    z.object({
      farmId: uuid,
      plotId: uuid.nullish(),
      /** T-01: una tarea por lote (lotes elegidos en el mapa). Con esto, `plotId` se ignora. */
      plotIds: z.array(uuid).min(1).max(LIMITS.tasks.maxPlotsPerBatch).optional(),
      assigneeId: z.string(),
      title: z.string().trim().min(1).max(200),
      kind: z.enum(RECORD_KINDS).nullish(),
      dueDate: isoDate,
      dueTime: timeOfDay.nullish(),
      priority: z.enum(TASK_PRIORITIES).default("normal"),
      recurrence: z.enum(RECURRENCES).default("none"),
      /** Texto de cada ítem de la lista de verificación (F-15). */
      checklist: z.array(z.string().trim().max(LIMITS.checklist.maxTextLength)).max(LIMITS.checklist.maxItems).optional(),
      lon: z.number().min(-180).max(180).nullish(),
      lat: z.number().min(-90).max(90).nullish(),
    }).refine((b) => (b.lon == null) === (b.lat == null), { message: "lon y lat van juntas" }),
    await readJson(c.req),
  );
  const { plotIds, plotId, kind, dueTime, checklist, ...rest } = body;
  const { ids } = await c.var.sdb.createTasks({
    ...rest,
    plotIds: plotIds ?? [plotId ?? null],
    kind: kind ?? null,
    dueTime: dueTime ?? null,
    lon: body.lon ?? null,
    lat: body.lat ?? null,
    checklist: serializeChecklist(newChecklist(checklist ?? [])),
  });
  return c.json({ id: ids[0]!, ids }, 201);
});
