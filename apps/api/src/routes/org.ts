/** Gestión desde la web: miembros, asignaciones, estancias, lotes, puntos de interés y tareas. */
import { Hono } from "hono";
import { z } from "zod";
import { areaHa, bboxOf, centroidOf, checkPlots, validateShape, type Area } from "@yvy/geo";
import { CROPS, doseText, LIMITS, newChecklist, prescriptionSchema, serializeChecklist, t, PLOT_KINDS, POI_KINDS, RECORD_KINDS, RECURRENCES, ROLES, SEASONS } from "@yvy/shared";
import { dispatchNewFarm, inBackground } from "../lib/dispatch";
import { sendEmail } from "../lib/email";
import { parse, readJson } from "../lib/http";
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
      assigneeId: z.string(),
      title: z.string().trim().min(1).max(200),
      kind: z.enum(RECORD_KINDS).nullish(),
      dueDate: isoDate,
      recurrence: z.enum(RECURRENCES).default("none"),
      /** Texto de cada ítem de la lista de verificación (F-15). */
      checklist: z.array(z.string().trim().max(LIMITS.checklist.maxTextLength)).max(LIMITS.checklist.maxItems).optional(),
      lon: z.number().min(-180).max(180).nullish(),
      lat: z.number().min(-90).max(90).nullish(),
    }).refine((b) => (b.lon == null) === (b.lat == null), { message: "lon y lat van juntas" }),
    await readJson(c.req),
  );
  const { checklist, ...rest } = body;
  return c.json(
    await c.var.sdb.createTask({
      ...rest,
      plotId: body.plotId ?? null,
      kind: body.kind ?? null,
      lon: body.lon ?? null,
      lat: body.lat ?? null,
      checklist: serializeChecklist(newChecklist(checklist ?? [])),
    }),
    201,
  );
});
