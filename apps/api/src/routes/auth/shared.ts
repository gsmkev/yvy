/** Piezas comunes del ingreso. */
import { HTTPException } from "hono/http-exception";
import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { z } from "zod";
import { LIMITS, t } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { issueSession, type Session } from "../../auth/session";
import { totpEnabled } from "../../auth/totp";
import { signTicket } from "../../lib/totp";
import { getDb } from "../../db/client";

export const email = z.string().trim().toLowerCase().email().max(254);
export const deviceId = z.string().min(1).max(64).nullish();
export const MAX_CODES_PER_WINDOW = 3;

/**
 * V-05 / V-06: usuario con rol de agrónomo o dueño (productor) en alguna organización cuyo código de referido es `code`.
 * El código son los últimos 8 caracteres del id (ver referralCode), así que se busca por sufijo.
 */
export async function findReferrer(db: ReturnType<typeof getDb>, code: string): Promise<string | null> {
  const [row] = await db
    .select({ id: s.users.id })
    .from(s.users)
    .innerJoin(s.memberships, and(eq(s.memberships.userId, s.users.id), inArray(s.memberships.role, ["agronomist", "owner"]), isNull(s.memberships.deletedAt)))
    .where(like(s.users.id, `%${code.toLowerCase()}`))
    .limit(1);
  return row?.id ?? null;
}

/**
 * P-08: tras el código de email (o Google), quien tiene segundo factor no recibe sesión sino un pase de 5 minutos que
 * se canjea en /auth/totp/login con el código de la app. Sin segundo factor, la sesión sale como siempre.
 */
export async function sessionOrChallenge(
  db: ReturnType<typeof getDb>,
  secret: string,
  userId: string,
  opts: { organizationId?: string; deviceId?: string | null; now: number },
): Promise<{ session: Session } | { challenge: { mfaRequired: true; ticket: string } } | null> {
  if (await totpEnabled(db, userId)) {
    const ticket = await signTicket(secret, {
      userId,
      ...(opts.organizationId ? { organizationId: opts.organizationId } : {}),
      deviceId: opts.deviceId ?? null,
      exp: opts.now + LIMITS.auth.totpTicketTtlMs,
    });
    return { challenge: { mfaRequired: true, ticket } };
  }
  const session = await issueSession(db, secret, userId, opts);
  return session ? { session } : null;
}

// ---------- Segundo factor (P-08) ----------

export const locked = () => new HTTPException(429, { message: t("totp.common.locked", { min: Math.ceil(LIMITS.auth.totpLockMs / 60_000) }) });
export const orgRequiresTotp = async (db: ReturnType<typeof getDb>, orgId: string) => {
  const [org] = await db
    .select({ on: s.organizations.requireAdminTotp })
    .from(s.organizations)
    .where(eq(s.organizations.id, orgId))
    .limit(1);
  return !!org?.on;
};
