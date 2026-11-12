/**
 * Ingreso sin contraseñas (PRD-cloudflare §4.2, reemplaza RF-01):
 * - Dueño/admin/agrónomo: código de 6 dígitos por email (SHA-256, 10 min, 5 intentos).
 * - Empleado: QR de vinculación de un solo uso (24 h) generado por dueño/admin.
 */
import { funnelEvent } from "../db/events";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { and, count, desc, eq, gte, inArray, isNull, like, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { LIMITS, newId, parseReferralCode, PIN_REGEX, phoneKey, t } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { requireAuth } from "../auth/middleware";
import { issueSession, revokeRefresh, rotateRefresh } from "../auth/session";
import { getDb, runBatch } from "../db/client";
import { can } from "../db/scoped";
import { hmacHex, hmacVerifyHex, randomDigits, randomToken, sha256Hex } from "../lib/crypto";
import { hashPin, safeEqualHex } from "../lib/pin";
import { sendEmail } from "../lib/email";
import { parse, readJson } from "../lib/http";
import type { AppEnv } from "../types";

const email = z.string().trim().toLowerCase().email().max(254);
const deviceId = z.string().min(1).max(64).nullish();
const MAX_CODES_PER_WINDOW = 3;

export const auth = new Hono<AppEnv>();

/**
 * V-05 / V-06: usuario con rol de agrónomo o dueño (productor) en alguna organización cuyo código de referido es `code`.
 * El código son los últimos 8 caracteres del id (ver referralCode), así que se busca por sufijo.
 */
async function findReferrer(db: ReturnType<typeof getDb>, code: string): Promise<string | null> {
  const [row] = await db
    .select({ id: s.users.id })
    .from(s.users)
    .innerJoin(s.memberships, and(eq(s.memberships.userId, s.users.id), inArray(s.memberships.role, ["agronomist", "owner"]), isNull(s.memberships.deletedAt)))
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

/**
 * F-24: ingreso del empleado con teléfono y PIN de 6 dígitos, como alternativa al QR. Cada intento se cuenta ANTES de
 * mirar el PIN (un UPDATE atómico), así que ráfagas en paralelo no se pasan del tope: a lo sumo `pinMaxAttempts`
 * comparaciones por ventana de bloqueo. La respuesta es la misma para un teléfono sin PIN y para un PIN errado.
 */
auth.post("/pin/login", async (c) => {
  const body = parse(
    z.object({ phone: z.string().trim().min(6).max(30), pin: z.string().regex(PIN_REGEX), deviceId }),
    await readJson(c.req),
  );
  const bad = () => new HTTPException(401, { message: t("app.pinLoginBad") });
  const key = phoneKey(body.phone);
  if (!key) throw bad();
  const db = getDb(c.env.DB);
  const now = Date.now();
  const [pin] = await db.select().from(s.userPins).where(eq(s.userPins.phoneKey, key)).limit(1);
  if (!pin) {
    // Mismo trabajo que con un teléfono real, para no distinguirlos por el tiempo de respuesta.
    await hashPin(c.env.JWT_SECRET, "x", body.pin);
    throw bad();
  }
  const locked = () => new HTTPException(429, { message: t("app.pinLoginLocked", { min: Math.ceil(LIMITS.auth.pinLockMs / 60_000) }) });
  // Cuenta el intento; si está bloqueada, el UPDATE no toca ninguna fila.
  const [bumped] = await db
    .update(s.userPins)
    .set({ failedAttempts: sql`${s.userPins.failedAttempts} + 1` })
    .where(and(eq(s.userPins.userId, pin.userId), or(isNull(s.userPins.lockedUntil), lte(s.userPins.lockedUntil, now))))
    .returning({ n: s.userPins.failedAttempts });
  if (!bumped) throw locked();
  const lock = () =>
    db
      .update(s.userPins)
      .set({ failedAttempts: 0, lockedUntil: now + LIMITS.auth.pinLockMs })
      .where(eq(s.userPins.userId, pin.userId));
  if (bumped.n > LIMITS.auth.pinMaxAttempts) {
    await lock();
    throw locked();
  }
  if (!safeEqualHex(await hashPin(c.env.JWT_SECRET, pin.salt, body.pin), pin.pinHash)) {
    if (bumped.n >= LIMITS.auth.pinMaxAttempts) {
      await lock();
      throw locked();
    }
    throw bad();
  }
  await db.update(s.userPins).set({ failedAttempts: 0, lockedUntil: null }).where(eq(s.userPins.userId, pin.userId));
  // Solo entra a la organización que fijó el PIN y mientras siga siendo empleado activo de ella.
  const session = await issueSession(db, c.env.JWT_SECRET, pin.userId, {
    organizationId: pin.organizationId,
    deviceId: body.deviceId,
    now,
  });
  if (!session || session.organization.role !== "worker") throw new HTTPException(403, { message: t("app.pinLoginNoAccess") });
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

// ---------- Ingreso con Google (P-07) ----------
// Opcional: sin GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET no existe. Solo entra quien ya tiene cuenta: se vincula por el
// email verificado por Google (no crea organizaciones). Flujo de código de autorización; el id_token llega directo del
// endpoint de Google por HTTPS, así que alcanza con revisar sus datos (aud, iss, exp, email_verified).

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_STATE_COOKIE = "yvy_g_state";
const GOOGLE_CODE_TTL_MS = 60_000;

const googleConfig = (env: AppEnv["Bindings"]) =>
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        id: env.GOOGLE_CLIENT_ID,
        secret: env.GOOGLE_CLIENT_SECRET,
        redirect: `${env.APP_URL.replace(/\/$/, "")}/auth/google/callback`,
      }
    : null;

/** El botón de la web se muestra solo si está configurado. */
auth.get("/google", (c) => c.json({ enabled: !!googleConfig(c.env) }));

auth.get("/google/start", async (c) => {
  const cfg = googleConfig(c.env);
  if (!cfg) throw new HTTPException(404, { message: "No existe" });
  const nonce = randomToken(16);
  const state = `${nonce}.${await hmacHex(c.env.JWT_SECRET, `gstate:${nonce}`)}`;
  setCookie(c, GOOGLE_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: c.env.APP_ENV !== "development",
    sameSite: "Lax",
    path: "/auth/google",
    maxAge: 600,
  });
  const url = new URL(GOOGLE_AUTH);
  url.search = new URLSearchParams({
    client_id: cfg.id,
    redirect_uri: cfg.redirect,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  return c.redirect(url.toString(), 302);
});

/** Datos del id_token que devuelve Google al canjear el código (sin firma: viene directo de su endpoint). */
export function googleClaims(idToken: string, clientId: string, nowSec: number) {
  try {
    const part = idToken.split(".")[1] ?? "";
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    const c = z
      .object({
        iss: z.enum(["https://accounts.google.com", "accounts.google.com"]),
        aud: z.literal(clientId),
        exp: z.number().gt(nowSec),
        email: z.string().email(),
        email_verified: z.union([z.literal(true), z.literal("true")]),
        sub: z.string(),
      })
      .safeParse(json);
    return c.success ? { email: c.data.email.toLowerCase(), sub: c.data.sub } : null;
  } catch {
    return null;
  }
}

auth.get("/google/callback", async (c) => {
  const cfg = googleConfig(c.env);
  if (!cfg) throw new HTTPException(404, { message: "No existe" });
  const back = (qs: string) => c.redirect(`${c.env.APP_URL.replace(/\/$/, "")}/ingresar?${qs}`, 302);
  const nonce = getCookie(c, GOOGLE_STATE_COOKIE);
  deleteCookie(c, GOOGLE_STATE_COOKIE, { path: "/auth/google" });
  const [stateNonce, sig] = (c.req.query("state") ?? "").split(".");
  const code = c.req.query("code");
  if (!nonce || nonce !== stateNonce || !sig || !(await hmacVerifyHex(c.env.JWT_SECRET, `gstate:${nonce}`, sig)))
    return back("google_error=state");
  if (!code) return back("google_error=denied");
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.id,
      client_secret: cfg.secret,
      redirect_uri: cfg.redirect,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return back("google_error=exchange");
  const { id_token } = (await res.json()) as { id_token?: string };
  const claims = id_token ? googleClaims(id_token, cfg.id, Math.floor(Date.now() / 1000)) : null;
  if (!claims) return back("google_error=unverified");
  const db = getDb(c.env.DB);
  const [user] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, claims.email)).limit(1);
  if (!user) return back("google_error=no_account");
  // Código de un solo uso (60 s) que la web canjea por la sesión: los tokens no viajan en la URL.
  const exchange = randomToken(24);
  const now = Date.now();
  const [m] = await db
    .select({ orgId: s.memberships.organizationId })
    .from(s.memberships)
    .where(and(eq(s.memberships.userId, user.id), isNull(s.memberships.deletedAt), eq(s.memberships.status, "active")))
    .limit(1);
  if (!m) return back("google_error=no_org");
  await db.insert(s.linkCodes).values({
    id: newId(),
    organizationId: m.orgId,
    userId: user.id,
    codeHash: await sha256Hex(`google:${exchange}`),
    expiresAt: now + GOOGLE_CODE_TTL_MS,
    createdBy: user.id,
    createdAt: now,
  });
  return back(`google=${exchange}`);
});

auth.post("/google/exchange", async (c) => {
  const body = parse(z.object({ code: z.string().min(20).max(64), deviceId }), await readJson(c.req));
  const db = getDb(c.env.DB);
  const now = Date.now();
  const used = await db
    .update(s.linkCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(s.linkCodes.codeHash, await sha256Hex(`google:${body.code}`)),
        isNull(s.linkCodes.usedAt),
        gte(s.linkCodes.expiresAt, now),
      ),
    )
    .returning({ userId: s.linkCodes.userId, organizationId: s.linkCodes.organizationId });
  const link = used[0];
  if (!link) throw new HTTPException(401, { message: "Código inválido o vencido" });
  const session = await issueSession(db, c.env.JWT_SECRET, link.userId, {
    organizationId: link.organizationId,
    deviceId: body.deviceId,
    now,
  });
  if (!session) throw new HTTPException(403, { message: "No pertenecés a ninguna organización activa" });
  return c.json(session);
});
