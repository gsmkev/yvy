/**
 * Rutas de alta de organizaciones, demo y ingreso con código por email.
 */
import { funnelEvent } from "../../db/events";
import { HTTPException } from "hono/http-exception";
import { and, count, desc, eq, gte, isNull } from "drizzle-orm";
import { z } from "zod";
import { LIMITS, newId, parseReferralCode, t } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { issueSession } from "../../auth/session";
import { getDb, runBatch } from "../../db/client";
import { randomDigits, sha256Hex } from "../../lib/crypto";
import { loginCodeEmail, sendEmail } from "../../lib/email";
import { parse, readJson } from "../../lib/http";
import type { AppEnv } from "../../types";
import { MAX_CODES_PER_WINDOW, deviceId, email, findReferrer, sessionOrChallenge } from "./shared";
import { Hono } from "hono";

/** Rutas de alta, demo y código por email. */
export const routes = new Hono<AppEnv>();

/** Alta de una organización nueva con su dueño. Después se ingresa con /auth/email/start. */
routes.post("/signup", async (c) => {
  if (c.env.ALLOW_SIGNUP !== "true") throw new HTTPException(403, { message: "Registro cerrado" });
  const body = parse(
    z.object({
      organizationName: z.string().trim().min(2).max(120),
      fullName: z.string().trim().min(2).max(120),
      email,
      /** Código de referido de un agrónomo (`?ref=`). Si no tiene forma válida se ignora; nunca frena el registro. */
      ref: z.unknown().optional(),
    }),
    await readJson(c.req),
  );
  const db = getDb(c.env.DB);
  const refCode = parseReferralCode(body.ref);
  const [existing] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, body.email)).limit(1);
  if (existing) throw new HTTPException(409, { message: "Ese email ya tiene cuenta; ingresá con el código" });
  const referrerUserId = refCode ? await findReferrer(db, refCode) : null;
  const ts = Date.now();
  const orgId = newId();
  const userId = newId();
  await runBatch(db, [
    db.insert(s.organizations).values({
      id: orgId,
      name: body.organizationName,
      referredBy: refCode,
      referrerUserId,
      trialEndsAt: ts + LIMITS.trialDays * 86_400_000,
      createdAt: ts,
      updatedAt: ts,
    }),
    db.insert(s.users).values({ id: userId, email: body.email, fullName: body.fullName, createdAt: ts, updatedAt: ts }),
    db
      .insert(s.memberships)
      .values({ id: newId(), organizationId: orgId, userId, role: "owner", createdAt: ts, updatedAt: ts }),
    funnelEvent(db, "signup", orgId, ts),
  ]);
  return c.json({ organizationId: orgId, userId }, 201);
});

/** La landing pregunta si hay demo configurada (404 si no). */
routes.get("/demo", (c) => {
  if (!c.env.DEMO_ORG_ID || !c.env.DEMO_USER_ID) throw new HTTPException(404, { message: "No existe" });
  return c.json({ available: true });
});

/** Sesión normal del dueño de la organización de ejemplo; el plan 'demo' la deja en solo lectura. */
routes.post("/demo", async (c) => {
  if (!c.env.DEMO_ORG_ID || !c.env.DEMO_USER_ID) throw new HTTPException(404, { message: "No existe" });
  const db = getDb(c.env.DB);
  // Nunca entregar una sesión de escritura: la organización tiene que estar marcada como demo.
  const [org] = await db
    .select({ plan: s.organizations.plan })
    .from(s.organizations)
    .where(eq(s.organizations.id, c.env.DEMO_ORG_ID))
    .limit(1);
  if (org?.plan !== "demo") throw new HTTPException(404, { message: "No existe" });
  const session = await issueSession(db, c.env.JWT_SECRET, c.env.DEMO_USER_ID, {
    organizationId: c.env.DEMO_ORG_ID,
    deviceId: "demo",
  });
  if (!session) throw new HTTPException(404, { message: "No existe" });
  return c.json(session);
});

routes.post("/email/start", async (c) => {
  const body = parse(z.object({ email }), await readJson(c.req));
  const db = getDb(c.env.DB);
  const now = Date.now();
  const [user] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, body.email)).limit(1);
  // Misma respuesta exista o no el usuario, para no revelar cuentas.
  if (!user) return c.json({ ok: true });
  // Tope por IP (sin IP, p. ej. en pruebas, no se limita por este lado).
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  if (ip) {
    const [{ n }] = (await db
      .select({ n: count() })
      .from(s.emailCodes)
      .where(and(eq(s.emailCodes.ip, ip), gte(s.emailCodes.createdAt, now - LIMITS.auth.emailCodesIpWindowMs)))) as [
      { n: number },
    ];
    if (n >= LIMITS.auth.emailCodesPerIp) throw new HTTPException(429, { message: t("ui.common.tooManyCodesIp") });
  }
  const recent = await db
    .select({ id: s.emailCodes.id })
    .from(s.emailCodes)
    .where(and(eq(s.emailCodes.email, body.email), gte(s.emailCodes.createdAt, now - LIMITS.auth.emailCodeTtlMs)));
  if (recent.length >= MAX_CODES_PER_WINDOW)
    throw new HTTPException(429, { message: "Esperá unos minutos antes de pedir otro código" });

  const code = randomDigits(6);
  await db.insert(s.emailCodes).values({
    id: newId(),
    email: body.email,
    codeHash: await sha256Hex(`${body.email}:${code}`),
    ip,
    expiresAt: now + LIMITS.auth.emailCodeTtlMs,
    createdAt: now,
  });
  await sendEmail(c.env, body.email, loginCodeEmail({ code, minutes: Math.round(LIMITS.auth.emailCodeTtlMs / 60_000) }));
  return c.json({ ok: true });
});

routes.post("/email/verify", async (c) => {
  const body = parse(
    z.object({ email, code: z.string().regex(/^\d{6}$/), organizationId: z.string().optional(), deviceId }),
    await readJson(c.req),
  );
  const db = getDb(c.env.DB);
  const now = Date.now();
  const [row] = await db
    .select()
    .from(s.emailCodes)
    .where(and(eq(s.emailCodes.email, body.email), isNull(s.emailCodes.usedAt), gte(s.emailCodes.expiresAt, now)))
    .orderBy(desc(s.emailCodes.createdAt))
    .limit(1);
  if (!row) throw new HTTPException(401, { message: "Código inválido o vencido" });
  if (row.attempts >= LIMITS.auth.emailCodeMaxAttempts)
    throw new HTTPException(429, { message: "Demasiados intentos; pedí otro código" });
  if ((await sha256Hex(`${body.email}:${body.code}`)) !== row.codeHash) {
    await db
      .update(s.emailCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(s.emailCodes.id, row.id));
    throw new HTTPException(401, { message: "Código inválido o vencido" });
  }
  const used = await db
    .update(s.emailCodes)
    .set({ usedAt: now })
    .where(and(eq(s.emailCodes.id, row.id), isNull(s.emailCodes.usedAt)))
    .returning({ id: s.emailCodes.id });
  if (!used.length) throw new HTTPException(401, { message: "Código inválido o vencido" });
  const [user] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, body.email)).limit(1);
  const out =
    user &&
    (await sessionOrChallenge(db, c.env.JWT_SECRET, user.id, {
      organizationId: body.organizationId,
      deviceId: body.deviceId,
      now,
    }));
  if (!out) throw new HTTPException(403, { message: "No pertenecés a ninguna organización activa" });
  return c.json("session" in out ? out.session : out.challenge);
});
