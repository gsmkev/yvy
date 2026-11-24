/**
 * Middleware de autenticación: valida el JWT de acceso y deja `auth` y la base con alcance (`sdb`) en el contexto.
 */
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { ROLES, t, type Role } from "@yvy/shared";
import { getDb } from "../db/client";
import { ScopedDb } from "../db/scoped";
import { verifyJwt } from "../lib/crypto";
import type { AppEnv } from "../types";

/**
 * Exige `Authorization: Bearer <jwt>` válido.
 * @throws HTTPException 401 si el token falta o venció; 403 en sesión de soporte con métodos de escritura o con el segundo factor pendiente de alta.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const claims = token ? await verifyJwt(c.env.JWT_SECRET, token, Math.floor(Date.now() / 1000)) : null;
  if (!claims || !ROLES.includes(claims.role as Role))
    throw new HTTPException(401, { message: "Sesión inválida o vencida" });
  const auth = {
    userId: claims.sub,
    orgId: claims.org,
    role: claims.role as Role,
    ...(claims.ro ? { readOnly: true, supportBy: claims.sup } : {}),
  };
  // una sesión de soporte no escribe nada y tampoco puede pedir otra sesión (/auth/switch es POST).
  if (auth.readOnly && !["GET", "HEAD"].includes(c.req.method))
    throw new HTTPException(403, { message: "Modo soporte: solo lectura" });
  // con el segundo factor exigido y sin dar de alta, lo único permitido es darlo de alta.
  if (claims.tsr && !c.req.path.startsWith("/auth/totp")) throw new HTTPException(403, { message: t("totp.common.setupRequired") });
  c.set("auth", auth);
  c.set("sdb", new ScopedDb(getDb(c.env.DB), auth));
  await next();
});
