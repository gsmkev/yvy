/** Segundo paso, vinculación de empleados, PIN y sesión. */
import { HTTPException } from "hono/http-exception";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { LIMITS, PIN_REGEX, phoneKey, t } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { issueSession, revokeRefresh, rotateRefresh } from "../../auth/session";
import { checkSecondFactor } from "../../auth/totp";
import { verifyTicket } from "../../lib/totp";
import { getDb } from "../../db/client";
import { sha256Hex } from "../../lib/crypto";
import { hashPin, safeEqualHex } from "../../lib/pin";
import { parse, readJson } from "../../lib/http";
import type { AppEnv } from "../../types";
import { deviceId } from "./shared";
import { Hono } from "hono";

export const routes = new Hono<AppEnv>();

/** P-08: segundo paso del ingreso. Código de 6 dígitos de la app, o un código de recuperación (de un solo uso). */
routes.post("/totp/login", async (c) => {
  const body = parse(z.object({ ticket: z.string().min(20).max(1000), code: z.string().trim().min(6).max(20) }), await readJson(c.req));
  const db = getDb(c.env.DB);
  const now = Date.now();
  const ticket = await verifyTicket(c.env.JWT_SECRET, body.ticket, now);
  if (!ticket) throw new HTTPException(401, { message: t("totp.common.ticketExpired") });
  const res = await checkSecondFactor(db, c.env.JWT_SECRET, ticket.userId, body.code, now);
  if (res === "locked")
    throw new HTTPException(429, { message: t("totp.common.locked", { min: Math.ceil(LIMITS.auth.totpLockMs / 60_000) }) });
  if (res !== "ok") throw new HTTPException(401, { message: t("totp.common.bad") });
  const session = await issueSession(db, c.env.JWT_SECRET, ticket.userId, {
    organizationId: ticket.organizationId,
    deviceId: ticket.deviceId,
    now,
  });
  if (!session) throw new HTTPException(403, { message: "No pertenecés a ninguna organización activa" });
  return c.json(session);
});

/** El empleado escanea el QR (contenido: yvy://link?c=<código>) y queda vinculado a este dispositivo. */
routes.post("/link/redeem", async (c) => {
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
routes.post("/pin/login", async (c) => {
  const body = parse(
    z.object({ phone: z.string().trim().min(6).max(30), pin: z.string().regex(PIN_REGEX), deviceId }),
    await readJson(c.req),
  );
  const bad = () => new HTTPException(401, { message: t("app.pin.loginBad") });
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
  const locked = () => new HTTPException(429, { message: t("app.pin.loginLocked", { min: Math.ceil(LIMITS.auth.pinLockMs / 60_000) }) });
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
  if (!session || session.organization.role !== "worker") throw new HTTPException(403, { message: t("app.pin.loginNoAccess") });
  return c.json(session);
});

routes.post("/refresh", async (c) => {
  const body = parse(z.object({ refreshToken: z.string().min(20) }), await readJson(c.req));
  const session = await rotateRefresh(getDb(c.env.DB), c.env.JWT_SECRET, body.refreshToken);
  if (!session) throw new HTTPException(401, { message: "Sesión vencida; ingresá de nuevo" });
  return c.json(session);
});

routes.post("/logout", async (c) => {
  const body = parse(z.object({ refreshToken: z.string().min(20) }), await readJson(c.req));
  await revokeRefresh(getDb(c.env.DB), body.refreshToken);
  return c.json({ ok: true });
});
