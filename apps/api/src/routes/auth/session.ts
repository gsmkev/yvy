/**
 * Con sesión: cambiar de organización y generar el QR de vinculación.
 */
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { LIMITS, newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { requireAuth } from "../../auth/middleware";
import { issueSession } from "../../auth/session";
import { getDb } from "../../db/client";
import { can } from "../../db/scoped";
import { randomToken, sha256Hex } from "../../lib/crypto";
import { parse, readJson } from "../../lib/http";
import type { AppEnv } from "../../types";
import { deviceId } from "./shared";
import { Hono } from "hono";

/** Rutas de `/auth` que exigen sesión: cambio de organización y QR de vinculación. */
export const routes = new Hono<AppEnv>();

// ---------- Con sesión ----------

/** Cambiar de organización. */
routes.post("/switch", requireAuth, async (c) => {
  const body = parse(z.object({ organizationId: z.string(), deviceId }), await readJson(c.req));
  const session = await issueSession(getDb(c.env.DB), c.env.JWT_SECRET, c.var.auth.userId, body);
  if (!session) throw new HTTPException(403, { message: "No pertenecés a esa organización" });
  return c.json(session);
});

/** Dueño/admin genera el QR de vinculación de un empleado. */
routes.post("/link", requireAuth, async (c) => {
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
