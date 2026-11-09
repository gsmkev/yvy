import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { ROLES, type Role } from "@yvy/shared";
import { getDb } from "../db/client";
import { ScopedDb } from "../db/scoped";
import { verifyJwt } from "../lib/crypto";
import type { AppEnv } from "../types";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const claims = token ? await verifyJwt(c.env.JWT_SECRET, token, Math.floor(Date.now() / 1000)) : null;
  if (!claims || !ROLES.includes(claims.role as Role))
    throw new HTTPException(401, { message: "Sesión inválida o vencida" });
  const auth = { userId: claims.sub, orgId: claims.org, role: claims.role as Role };
  c.set("auth", auth);
  c.set("sdb", new ScopedDb(getDb(c.env.DB), auth));
  await next();
});
