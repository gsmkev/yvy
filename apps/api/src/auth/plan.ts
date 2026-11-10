/**
 * Prueba gratis de 60 días (PRD Fase 8). Al vencer: bloqueo suave = la gestión queda en solo lectura.
 * El push del celular nunca se bloquea: lo que cargan los empleados en el campo no se pierde.
 */
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { eq, sql } from "drizzle-orm";
import { localDate, t } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { getDb } from "../db/client";
import type { AppEnv } from "../types";

/** La demo pública (plan 'demo') es de solo lectura: toda escritura se rechaza. */
export const readOnlyDemo = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.method !== "GET") {
    const [org] = await getDb(c.env.DB)
      .select({ plan: s.organizations.plan })
      .from(s.organizations)
      .where(eq(s.organizations.id, c.var.auth.orgId))
      .limit(1);
    if (org?.plan === "demo") throw new HTTPException(403, { message: t("ui.publicDemoReadOnly") });
  }
  await next();
});

export const readOnlyWhenExpired = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.method !== "GET") {
    const [org] = await getDb(c.env.DB)
      .select({ plan: s.organizations.plan, trialEndsAt: s.organizations.trialEndsAt })
      .from(s.organizations)
      .where(eq(s.organizations.id, c.var.auth.orgId))
      .limit(1);
    if (org?.plan === "demo") throw new HTTPException(403, { message: t("ui.publicDemoReadOnly") });
    const expired =
      org &&
      ((org.plan === "trial" && org.trialEndsAt !== null && org.trialEndsAt < Date.now()) || org.plan === "blocked");
    if (expired)
      throw new HTTPException(402, {
        message: "Tu prueba gratis terminó: Yvy quedó en modo solo lectura. Escribinos para activarlo.",
      });
  }
  await next();
});

/** Marca actividad del día (una fila por usuario y día; INSERT OR IGNORE no escribe si ya existe). */
export async function touchActivity(
  db: ReturnType<typeof getDb>,
  auth: { userId: string; orgId: string; role: string },
) {
  await db.run(
    sql`INSERT OR IGNORE INTO activity_daily (user_id, organization_id, day, role) VALUES (${auth.userId}, ${auth.orgId}, ${localDate(Date.now())}, ${auth.role})`,
  );
}
