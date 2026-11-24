/** Perfil, sesión, calendario, preferencias, eventos y clientes. */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { createFeed, feedStatus, revokeFeed } from "../../db/calendar-feed";
import { referralCode, localDate, notificationPrefsSchema, LIMITS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { getNotificationPrefs, getOnboarding, saveOnboarding, saveNotificationPrefs } from "../../db/queries";
import { clientsOverview } from "../../db/clients";
import { parse, readJson } from "../../lib/http";
import { touchActivity } from "../../auth/plan";
import type { AppEnv } from "../../types";
import { Hono } from "hono";

export const routes = new Hono<AppEnv>();

/** Perfil y sesión actual. */
routes.get("/me", async (c) => {
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

/**
 * V-05 / V-06: código de referido del agrónomo o del productor (dueño de una organización); null para los demás roles.
 * Con cuántas organizaciones se registraron con su código y en cuántas el equipo ya anotó el crédito.
 */
routes.get("/me/referral", async (c) => {
  const sdb = c.var.sdb;
  const [m] = await sdb.db
    .select({ id: s.memberships.id })
    .from(s.memberships)
    .where(
      and(
        eq(s.memberships.userId, sdb.auth.userId),
        inArray(s.memberships.role, ["agronomist", "owner"]),
        eq(s.memberships.status, "active"),
        isNull(s.memberships.deletedAt),
      ),
    )
    .limit(1);
  if (!m) return c.json({ code: null, referred: 0, credited: 0 });
  const [n] = await sdb.db
    .select({
      referred: sql<number>`count(*)`,
      credited: sql<number>`sum(${s.organizations.referralCreditedAt} IS NOT NULL)`,
    })
    .from(s.organizations)
    .where(eq(s.organizations.referrerUserId, sdb.auth.userId));
  return c.json({
    code: referralCode(sdb.auth.userId),
    referred: Number(n?.referred ?? 0),
    credited: Number(n?.credited ?? 0),
  });
});

/** U-29: qué avisos le llegan al usuario, por qué canal y en qué horario. Valen para todas sus organizaciones. */
/** I-04: enlace del calendario de tareas (.ics). La URL con el token se muestra una sola vez; regenerarla revoca la anterior. */
routes.get("/me/calendar-feed", async (c) => c.json(await feedStatus(c.var.sdb)));
routes.post("/me/calendar-feed", async (c) => {
  const token = await createFeed(c.var.sdb);
  return c.json({ url: `${c.env.APP_URL.replace(/\/$/, "")}/public/calendar/${token}.ics` }, 201);
});
routes.delete("/me/calendar-feed", async (c) => {
  await revokeFeed(c.var.sdb);
  return c.json({ ok: true });
});
routes.get("/me/onboarding", async (c) => c.json(await getOnboarding(c.var.sdb)));
routes.put("/me/onboarding", async (c) => {
  const b = parse(z.object({ dismissed: z.boolean() }), await readJson(c.req));
  return c.json(await saveOnboarding(c.var.sdb, b.dismissed));
});
routes.get("/me/notification-prefs", async (c) => c.json(await getNotificationPrefs(c.var.sdb)));
routes.put("/me/notification-prefs", async (c) => {
  const prefs = parse(notificationPrefsSchema, await readJson(c.req));
  await saveNotificationPrefs(c.var.sdb, prefs);
  return c.json(await getNotificationPrefs(c.var.sdb));
});

/**
 * P-03: pantalla abierta en la web ("view:tareas"). No se guarda quién ni de qué organización: solo se suma al
 * contador del día de esa pantalla (una fila por día y nombre). Se muestrea (cada evento guardado cuenta 1 / sampleRate)
 * y cada pantalla tiene un tope diario, así el plan gratis de D1 no se agota. Los pasos del embudo los escribe solo el
 * servidor y no entran por acá.
 */
routes.post("/events", async (c) => {
  const { name } = parse(
    z.object({
      name: z
        .string()
        .regex(/^view:[a-z0-9_.-]+$/)
        .max(LIMITS.events.nameLength),
    }),
    await readJson(c.req),
  );
  if (Math.random() >= LIMITS.events.sampleRate) return c.json({ recorded: false }, 202);
  const weight = Math.round(1 / LIMITS.events.sampleRate);
  const day = localDate(Date.now());
  const r = await c.var.sdb.db
    .insert(s.eventsDaily)
    .values({ day, name, n: weight })
    .onConflictDoUpdate({
      target: [s.eventsDaily.day, s.eventsDaily.name],
      set: { n: sql`${s.eventsDaily.n} + ${weight}` },
      setWhere: sql`${s.eventsDaily.n} < ${LIMITS.events.maxPerNamePerDay}`,
    });
  return c.json({ recorded: (r.meta?.changes ?? 1) > 0 }, 202);
});

/** K-02: estancias y avisos de todas las organizaciones de la persona (vista del agrónomo). */
routes.get("/me/clients", async (c) =>
  // Una sesión de soporte ve solo la organización que se pidió, no las otras de la misma persona.
  c.json(
    await clientsOverview(c.var.sdb.db, c.var.auth.userId, {
      onlyOrgId: c.var.auth.readOnly ? c.var.auth.orgId : undefined,
    }),
  ),
);
