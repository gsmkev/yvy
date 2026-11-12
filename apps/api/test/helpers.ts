import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import type { Polygon } from "geojson";
import { newId, type Role } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { app } from "../src/app";
import { issueSession } from "../src/auth/session";
import { getDb } from "../src/db/client";

export const db = () => getDb(env.DB);

export const call = async <T = any>(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
) => {
  const res = await app.request(
    path,
    {
      method,
      headers: {
        "content-type": "application/json",
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
    },
    env,
  );
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
};

/** Cuadrado de `size` grados con esquina en (lon, lat). */
export const square = (lon: number, lat: number, size = 0.01): Polygon => ({
  type: "Polygon",
  coordinates: [
    [
      [lon, lat],
      [lon + size, lat],
      [lon + size, lat - size],
      [lon, lat - size],
      [lon, lat],
    ],
  ],
});

export async function createOrgWithOwner(name = "Estancia Test") {
  const ts = Date.now();
  const orgId = newId();
  const userId = newId();
  await db().insert(s.organizations).values({ id: orgId, name, createdAt: ts, updatedAt: ts });
  await db()
    .insert(s.users)
    .values({ id: userId, email: `${userId}@test.py`, fullName: "Dueño", createdAt: ts, updatedAt: ts });
  await db()
    .insert(s.memberships)
    .values({ id: newId(), organizationId: orgId, userId, role: "owner", createdAt: ts, updatedAt: ts });
  const session = await issueSession(db(), env.JWT_SECRET, userId);
  return { orgId, userId, token: session!.accessToken };
}

export async function addMemberAndLogin(ownerToken: string, role: Role, fullName = "Ramón") {
  const r = await call<{ userId: string }>("POST", "/org/members", {
    token: ownerToken,
    body: { fullName, role, email: role === "worker" ? null : `${newId()}@test.py` },
  });
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  const session = await issueSession(db(), env.JWT_SECRET, r.body.userId);
  return { userId: r.body.userId, token: session!.accessToken };
}

/** Estancia con N lotes en grilla, vía la API. */
export async function createFarmWithPlots(token: string, n: number) {
  const farm = await call<{ id: string }>("POST", "/org/farms", {
    token,
    body: { name: "La Esperanza", geometry: square(-55.9, -27.2, 0.2) },
  });
  if (farm.status !== 201) throw new Error(JSON.stringify(farm.body));
  const plotIds: string[] = [];
  for (let i = 0; i < n; i += 40) {
    const plots = Array.from({ length: Math.min(40, n - i) }, (_, k) => ({
      name: `Lote ${i + k + 1}`,
      kind: "crop",
      crop: "soja",
      geometry: square(-55.9 + ((i + k) % 10) * 0.015, -27.2 - Math.floor((i + k) / 10) * 0.015),
    }));
    const r = await call<{ ids: string[] }>("POST", `/org/farms/${farm.body.id}/plots`, { token, body: { plots } });
    if (r.status !== 201) throw new Error(JSON.stringify(r.body));
    plotIds.push(...r.body.ids);
  }
  return { farmId: farm.body.id, plotIds };
}

export async function pullAll(token: string, table: string) {
  const rows: any[] = [];
  let cursor = null;
  for (;;) {
    const r: any = await call("POST", "/sync/pull", { token, body: { table, cursor } });
    if (r.status !== 200) throw new Error(JSON.stringify(r.body));
    rows.push(...r.body.rows);
    cursor = r.body.cursor ?? cursor;
    if (!r.body.hasMore) return rows;
  }
}

/** Sesión del equipo de Yvy (email en ADMIN_EMAILS del vitest.config) con su propia organización. */
export async function createStaff() {
  const ts = Date.now();
  const orgId = newId();
  await db().insert(s.organizations).values({ id: orgId, name: "Equipo Yvy", plan: "active", createdAt: ts, updatedAt: ts });
  let [u] = await db().select().from(s.users).where(eq(s.users.email, "staff@yvy.test")).limit(1);
  if (!u) {
    const id = newId();
    await db().insert(s.users).values({ id, email: "staff@yvy.test", fullName: "Equipo", createdAt: ts, updatedAt: ts });
    [u] = await db().select().from(s.users).where(eq(s.users.id, id)).limit(1);
  }
  await db()
    .insert(s.memberships)
    .values({ id: newId(), organizationId: orgId, userId: u!.id, role: "admin", createdAt: ts, updatedAt: ts });
  const session = await issueSession(db(), env.JWT_SECRET, u!.id, { organizationId: orgId });
  return { orgId, userId: u!.id, token: session!.accessToken };
}
