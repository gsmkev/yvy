/**
 * Sesiones (PRD-cloudflare §4.2): access JWT HS256 de 1 h + refresh aleatorio de 90 días guardado como
 * SHA-256, rotado en cada uso. Este módulo corre antes de que exista un usuario autenticado, por eso
 * usa la base directa y no scopedDb.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { LIMITS, newId, type Role } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import type { DB } from "../db/client";
import { randomToken, sha256Hex, signJwt } from "../lib/crypto";

export interface Session {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
  user: { id: string; fullName: string; email: string | null };
  organization: { id: string; name: string; role: Role };
  organizations: { id: string; name: string; role: Role }[];
}

export async function membershipsOf(db: DB, userId: string) {
  return db
    .select({ id: s.organizations.id, name: s.organizations.name, role: s.memberships.role })
    .from(s.memberships)
    .innerJoin(s.organizations, eq(s.organizations.id, s.memberships.organizationId))
    .where(and(eq(s.memberships.userId, userId), isNull(s.memberships.deletedAt), eq(s.memberships.status, "active")))
    .orderBy(asc(s.memberships.createdAt));
}

/** Emite una sesión para la organización pedida (o la primera). null si no es miembro activo. */
export async function issueSession(
  db: DB,
  jwtSecret: string,
  userId: string,
  opts: { organizationId?: string; deviceId?: string | null; now?: number } = {},
): Promise<Session | null> {
  const now = opts.now ?? Date.now();
  const [user] = await db
    .select({ id: s.users.id, fullName: s.users.fullName, email: s.users.email })
    .from(s.users)
    .where(eq(s.users.id, userId))
    .limit(1);
  if (!user) return null;
  const orgs = await membershipsOf(db, userId);
  const org = opts.organizationId ? orgs.find((o) => o.id === opts.organizationId) : orgs[0];
  if (!org) return null;

  const exp = Math.floor(now / 1000) + LIMITS.auth.accessTokenTtlSeconds;
  const accessToken = await signJwt(jwtSecret, {
    sub: userId,
    org: org.id,
    role: org.role,
    iat: Math.floor(now / 1000),
    exp,
  });
  const refreshToken = randomToken(32);
  const refreshTokenExpiresAt = now + LIMITS.auth.refreshTokenTtlMs;
  await db.insert(s.refreshTokens).values({
    id: newId(),
    userId,
    organizationId: org.id,
    deviceId: opts.deviceId ?? null,
    tokenHash: await sha256Hex(refreshToken),
    expiresAt: refreshTokenExpiresAt,
    createdAt: now,
  });
  return {
    accessToken,
    accessTokenExpiresAt: exp * 1000,
    refreshToken,
    refreshTokenExpiresAt,
    user,
    organization: org,
    organizations: orgs,
  };
}

/** Rota un refresh token. null si no existe, venció o fue revocado. */
export async function rotateRefresh(
  db: DB,
  jwtSecret: string,
  token: string,
  now = Date.now(),
): Promise<Session | null> {
  const hash = await sha256Hex(token);
  const [row] = await db.select().from(s.refreshTokens).where(eq(s.refreshTokens.tokenHash, hash)).limit(1);
  if (!row || row.revokedAt || row.expiresAt <= now) return null;
  const revoked = await db
    .update(s.refreshTokens)
    .set({ revokedAt: now })
    .where(and(eq(s.refreshTokens.id, row.id), isNull(s.refreshTokens.revokedAt)))
    .returning({ id: s.refreshTokens.id });
  if (revoked.length === 0) return null; // carrera: otro request ya lo rotó
  return issueSession(db, jwtSecret, row.userId, { organizationId: row.organizationId, deviceId: row.deviceId, now });
}

export async function revokeRefresh(db: DB, token: string, now = Date.now()): Promise<void> {
  await db
    .update(s.refreshTokens)
    .set({ revokedAt: now })
    .where(eq(s.refreshTokens.tokenHash, await sha256Hex(token)));
}
