/** Segundo factor (P-08). */
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { t } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { requireAuth } from "../../auth/middleware";
import { beginSetup, checkSecondFactor, disableTotp, issueRecoveryCodes, totpStatus } from "../../auth/totp";
import { getDb } from "../../db/client";
import { parse, readJson } from "../../lib/http";
import type { AppEnv } from "../../types";
import { locked, orgRequiresTotp } from "./shared";
import { Hono } from "hono";

export const routes = new Hono<AppEnv>();

/** Estado propio: si lo tiene, cuántos códigos de recuperación quedan y si la organización lo exige. */
routes.get("/totp", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  return c.json({
    ...(await totpStatus(db, c.var.auth.userId)),
    requiredByOrg: c.var.auth.role === "admin" && (await orgRequiresTotp(db, c.var.auth.orgId)),
  });
});

/** Empieza el alta: devuelve el secreto y la URI otpauth:// que la web dibuja como QR. Reemplaza un alta sin confirmar. */
routes.post("/totp/setup", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const [u] = await db
    .select({ email: s.users.email, fullName: s.users.fullName })
    .from(s.users)
    .where(eq(s.users.id, c.var.auth.userId))
    .limit(1);
  const r = await beginSetup(db, c.env.JWT_SECRET, c.var.auth.userId, u?.email ?? u?.fullName ?? "Yvy", Date.now());
  if (!r) throw new HTTPException(409, { message: t("totp.common.alreadyOn") });
  return c.json(r);
});

/** Confirma el alta con un código de la app y entrega los códigos de recuperación (una sola vez). */
routes.post("/totp/enable", requireAuth, async (c) => {
  const body = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), await readJson(c.req));
  const db = getDb(c.env.DB);
  const now = Date.now();
  const res = await checkSecondFactor(db, c.env.JWT_SECRET, c.var.auth.userId, body.code, now, true);
  if (res === "locked") throw locked();
  if (res !== "ok") throw new HTTPException(400, { message: t("totp.common.bad") });
  await db.update(s.userTotp).set({ enabledAt: now }).where(eq(s.userTotp.userId, c.var.auth.userId));
  return c.json({ recoveryCodes: await issueRecoveryCodes(db, c.var.auth.userId, now) }, 201);
});

/** Códigos de recuperación nuevos; pide un código vigente (de la app o de recuperación). */
routes.post("/totp/recovery-codes", requireAuth, async (c) => {
  const body = parse(z.object({ code: z.string().trim().min(6).max(20) }), await readJson(c.req));
  const db = getDb(c.env.DB);
  const now = Date.now();
  const res = await checkSecondFactor(db, c.env.JWT_SECRET, c.var.auth.userId, body.code, now);
  if (res === "locked") throw locked();
  if (res !== "ok") throw new HTTPException(400, { message: t("totp.common.bad") });
  return c.json({ recoveryCodes: await issueRecoveryCodes(db, c.var.auth.userId, now) });
});

/** Lo apaga; pide un código vigente. El administrador de una organización que lo exige no puede apagarlo. */
routes.post("/totp/disable", requireAuth, async (c) => {
  const body = parse(z.object({ code: z.string().trim().min(6).max(20) }), await readJson(c.req));
  const db = getDb(c.env.DB);
  if (c.var.auth.role === "admin" && (await orgRequiresTotp(db, c.var.auth.orgId)))
    throw new HTTPException(403, { message: t("totp.common.requiredByOrg") });
  const res = await checkSecondFactor(db, c.env.JWT_SECRET, c.var.auth.userId, body.code, Date.now());
  if (res === "locked") throw locked();
  if (res !== "ok") throw new HTTPException(400, { message: t("totp.common.bad") });
  await disableTotp(db, c.var.auth.userId);
  return c.json({ ok: true });
});
