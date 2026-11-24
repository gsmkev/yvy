/** Avisos, enlaces de solo lectura, ganadería, sanidad y dispositivos. */
import { z } from "zod";
import { alertSettingsSchema, BREEDING_DAYS_LIMITS, isBreedingStart, MAX_UA_PER_HA_LIMITS, PASTURE_CLASSES, PRODUCTION_SYSTEMS, RECOMMENDED_LOAD_LIMITS, sanitaryEventSchema } from "@yvy/shared";
import { alertFeedback, createShareLink, getAlertSettings, listAlerts, listShareLinks, registerDevice, saveAlertSettings, revokeShareLink } from "../../db/queries";
import { farmStockSummary, saveLivestockSettings } from "../../db/livestock";
import { createSanitaryEvent, deleteSanitaryEvent, listSanitaryEvents, senacsaForOrg } from "../../db/sanitary";
import { parse, readJson } from "../../lib/http";
import type { AppEnv } from "../../types";
import { Hono } from "hono";

/** Rutas de avisos, enlaces compartidos, hacienda, sanidad y dispositivos. */
export const routes = new Hono<AppEnv>();

routes.get("/org/alerts", async (c) => {
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
routes.get("/org/farms/:id/share-links", async (c) => c.json(await listShareLinks(c.var.sdb, c.req.param("id"))));
routes.post("/org/farms/:id/share-links", async (c) => {
  const b = parse(z.object({ days: z.number().int() }), await readJson(c.req));
  return c.json(await createShareLink(c.var.sdb, c.req.param("id"), b.days), 201);
});
routes.delete("/org/share-links/:id", async (c) => {
  await revokeShareLink(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});
// Hacienda calculada y carga máxima configurable.
routes.get("/org/farms/:id/stock", async (c) => c.json(await farmStockSummary(c.var.sdb, c.req.param("id"))));
routes.put("/org/farms/:id/livestock-settings", async (c) => {
  const load = z.number().min(RECOMMENDED_LOAD_LIMITS.min).max(RECOMMENDED_LOAD_LIMITS.max);
  const b = parse(
    z.object({
      maxUaPerHa: z.number().min(MAX_UA_PER_HA_LIMITS.min).max(MAX_UA_PER_HA_LIMITS.max).optional(),
      system: z.enum(PRODUCTION_SYSTEMS).optional(),
      pastureDefault: z.enum(PASTURE_CLASSES).optional(),
      breedingStart: z.string().refine(isBreedingStart, "Fecha inválida (MM-DD)").optional(),
      breedingDays: z.number().int().min(BREEDING_DAYS_LIMITS.min).max(BREEDING_DAYS_LIMITS.max).optional(),
      pastureLoads: z.object({ natural: load.optional(), implantada: load.optional(), mejorada: load.optional() }).strict().optional(),
    }),
    await readJson(c.req),
  );
  await saveLivestockSettings(c.var.sdb, c.req.param("id"), b);
  return c.json({ ok: true });
});

// Calendario sanitario.
// Campañas oficiales de SENACSA.
routes.get("/org/senacsa", async (c) => {
  const q = parse(z.object({ year: z.coerce.number().int().min(2020).max(2100) }), c.req.query());
  return c.json(await senacsaForOrg(c.var.sdb, q.year));
});
routes.get("/org/sanitary-events", async (c) => {
  const q = parse(
    z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), farmId: z.string().uuid().optional() }),
    c.req.query(),
  );
  return c.json(await listSanitaryEvents(c.var.sdb, q.month, q.farmId));
});
routes.post("/org/sanitary-events", async (c) => {
  const b = parse(sanitaryEventSchema, await readJson(c.req));
  return c.json(await createSanitaryEvent(c.var.sdb, b), 201);
});
routes.delete("/org/sanitary-events/:id", async (c) => {
  await deleteSanitaryEvent(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

routes.get("/org/farms/:id/alert-settings", async (c) => c.json(await getAlertSettings(c.var.sdb, c.req.param("id"))));
routes.put("/org/farms/:id/alert-settings", async (c) => {
  const b = parse(alertSettingsSchema, await readJson(c.req));
  await saveAlertSettings(c.var.sdb, c.req.param("id"), b);
  return c.json({ ok: true });
});
routes.post("/org/alerts/:id/feedback", async (c) => {
  const b = parse(z.object({ useful: z.boolean(), comment: z.string().max(1000).nullish() }), await readJson(c.req));
  await alertFeedback(c.var.sdb, c.req.param("id"), b.useful, b.comment ?? null);
  return c.json({ ok: true });
});

routes.post("/devices", async (c) => {
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
