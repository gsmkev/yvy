/**
 * Ingreso sin contraseñas (PRD-cloudflare §4.2, reemplaza RF-01):
 * - Dueño/admin/agrónomo: código de 6 dígitos por email (SHA-256, 10 min, 5 intentos).
 * - Empleado: QR de vinculación de un solo uso (24 h) generado por dueño/admin.
 */
import { funnelEvent } from "../db/events";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, count, desc, eq, gte, isNull, like } from "drizzle-orm";
import { z } from "zod";
import { LIMITS, newId, parseReferralCode, t } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { requireAuth } from "../auth/middleware";
import { issueSession, revokeRefresh, rotateRefresh } from "../auth/session";
import { getDb, runBatch } from "../db/client";
import { can } from "../db/scoped";
import { randomDigits, randomToken, sha256Hex } from "../lib/crypto";
import { sendEmail } from "../lib/email";
import { parse, readJson } from "../lib/http";
import type { AppEnv } from "../types";

const email = z.string().trim().toLowerCase().email().max(254);
const deviceId = z.string().min(1).max(64).nullish();
const MAX_CODES_PER_WINDOW = 3;

export const auth = new Hono<AppEnv>();

/**
 * V-05: usuario con rol de agrónomo (en alguna organización) cuyo código de referido es `code`.
 * El código son los últimos 8 caracteres del id (ver referralCode), así que se busca por sufijo.
 */
async function findReferrer(db: ReturnType<typeof getDb>, code: string): Promise<string | null> {
  const [row] = await db
    .select({ id: s.users.id })
    .from(s.users)
    .innerJoin(s.memberships, and(eq(s.memberships.userId, s.users.id), eq(s.memberships.role, "agronomist"), isNull(s.memberships.deletedAt)))
    .where(like(s.users.id, `%${code.toLowerCase()}`))
    .limit(1);
  return row?.id ?? null;
}

/** Alta de una organización nueva con su dueño. Después se ingresa con /auth/email/start. */
auth.post("/signup", async (c) => {
  if (c.env.ALLOW_SIGNUP !== "true") throw new HTTPException(403, { message: "Registro cerrado" });
  const body = parse(
    z.object({
      organizationName: z.string().trim().min(2).max(120),
      fullName: z.string().trim().min(2).max(120),
      email,
      /** V-05: código de referido de un agrónomo (`?ref=`). Si no tiene forma válida se ignora; nunca frena el registro. */
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
      trialEndsAt: ts + 60 * 86_400_000,
      createdAt: ts,
      updatedAt: ts,
    }),
    db.insert(s.users).values({ id: userId, email: body.email, fullName: body.fullName, createdAt: ts, updatedAt: ts }),
    db
      .insert(s.memberships)
      .values({ id: newId(), organizationId: orgId, userId, role: "owner", createdAt: ts, updatedAt: ts }),
    funnelEvent(db, "signup", userId, orgId, ts),
  ]);
  return c.json({ organizationId: orgId, userId }, 201);
});

/** La landing pregunta si hay demo configurada (404 si no). */
auth.get("/demo", (c) => {
  if (!c.env.DEMO_ORG_ID || !c.env.DEMO_USER_ID) throw new HTTPException(404, { message: "No existe" });
  return c.json({ available: true });
});

/** Sesión normal del dueño de la organización de ejemplo; el plan 'demo' la deja en solo lectura. */
auth.post("/demo", async (c) => {
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

auth.post("/email/start", async (c) => {
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
    if (n >= LIMITS.auth.emailCodesPerIp) throw new HTTPException(429, { message: t("ui.tooManyCodesIp") });
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
  await sendEmail(c.env, body.email, t("auth.emailSubject", { code }), t("auth.emailBody", { code }));
  return c.json({ ok: true });
});

auth.post("/email/verify", async (c) => {
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
  const session =
    user &&
    (await issueSession(db, c.env.JWT_SECRET, user.id, {
      organizationId: body.organizationId,
      deviceId: body.deviceId,
      now,
    }));
  if (!session) throw new HTTPException(403, { message: "No pertenecés a ninguna organización activa" });
  return c.json(session);
});

/** El empleado escanea el QR (contenido: yvy://link?c=<código>) y queda vinculado a este dispositivo. */
auth.post("/link/redeem", async (c) => {
  const body = parse(z.object({ code: z.string().min(20).max(64), deviceId }), await readJson(c.req));
  const db = getDb(c.env.DB);
  const now = Date.now();
  const used = await db
    .update(s.linkCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(s.linkCodes.codeHash, await sha256Hex(body.code)),
        isNull(s.linkCodes.usedAt),
        gte(s.linkCodes.expiresAt, now),
      ),
    )
    .returning({ userId: s.linkCodes.userId, organizationId: s.linkCodes.organizationId });
  const link = used[0];
  if (!link) throw new HTTPException(401, { message: "Código QR inválido, usado o vencido" });
  // Un dispositivo por empleado: se cierran las sesiones anteriores.
  await db
    .update(s.refreshTokens)
    .set({ revokedAt: now })
    .where(and(eq(s.refreshTokens.userId, link.userId), isNull(s.refreshTokens.revokedAt)));
  const session = await issueSession(db, c.env.JWT_SECRET, link.userId, {
    organizationId: link.organizationId,
    deviceId: body.deviceId,
    now,
  });
  if (!session) throw new HTTPException(403, { message: "Usuario sin acceso" });
  return c.json(session);
});

auth.post("/refresh", async (c) => {
  const body = parse(z.object({ refreshToken: z.string().min(20) }), await readJson(c.req));
  const session = await rotateRefresh(getDb(c.env.DB), c.env.JWT_SECRET, body.refreshToken);
  if (!session) throw new HTTPException(401, { message: "Sesión vencida; ingresá de nuevo" });
  return c.json(session);
});

auth.post("/logout", async (c) => {
  const body = parse(z.object({ refreshToken: z.string().min(20) }), await readJson(c.req));
  await revokeRefresh(getDb(c.env.DB), body.refreshToken);
  return c.json({ ok: true });
});

// ---------- Con sesión ----------

/** RF-02: cambiar de organización. */
auth.post("/switch", requireAuth, async (c) => {
  const body = parse(z.object({ organizationId: z.string(), deviceId }), await readJson(c.req));
  const session = await issueSession(getDb(c.env.DB), c.env.JWT_SECRET, c.var.auth.userId, body);
  if (!session) throw new HTTPException(403, { message: "No pertenecés a esa organización" });
  return c.json(session);
});

/** Dueño/admin genera el QR de vinculación de un empleado. */
auth.post("/link", requireAuth, async (c) => {
  const body = parse(z.object({ userId: z.string() }), await readJson(c.req));
  const sdb = c.var.sdb;
  sdb.require(can.manageWorkers, "Solo dueño o administrador vinculan empleados");
  await sdb.memberRole(body.userId);
  const code = randomToken(24);
  const now = Date.now();
  const expiresAt = now + LIMITS.auth.linkCodeTtlMs;
  await getDb(c.env.DB)
    .insert(s.linkCodes)
    .values({
      id: newId(),
      organizationId: c.var.auth.orgId,
      userId: body.userId,
      codeHash: await sha256Hex(code),
      expiresAt,
      createdBy: c.var.auth.userId,
      createdAt: now,
    });
  return c.json({ code, qr: `yvy://link?c=${code}`, expiresAt }, 201);
});
