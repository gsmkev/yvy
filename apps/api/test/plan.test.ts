import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { issueSession } from "../src/auth/session";
import { app } from "../src/app";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db, square } from "./helpers";

describe("Fase 8 · prueba gratis y panel interno", () => {
  it("prueba vencida: gestión en solo lectura, el campo sigue sincronizando", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    await db()
      .update(s.organizations)
      .set({ plan: "trial", trialEndsAt: Date.now() - 1000 })
      .where(eq(s.organizations.id, owner.orgId));

    const blocked = await call("POST", "/org/farms", {
      token: owner.token,
      body: { name: "x", geometry: square(-55, -27) },
    });
    expect(blocked.status).toBe(402);
    expect((await call("GET", "/org/farms", { token: owner.token })).status).toBe(200);

    const push = await call("POST", "/sync/push", {
      token: worker.token,
      body: {
        deviceId: "d",
        mutations: [
          {
            mutationId: newId(),
            kind: "records.upsert",
            row: {
              id: newId(),
              farmId,
              plotId: null,
              poiId: null,
              kind: "note",
              data: { text: "hola" },
              schemaVersion: RECORD_SCHEMA_VERSION,
              lon: null,
              lat: null,
              gpsAccuracyM: null,
              capturedAt: Date.now(),
            },
          },
        ],
      },
    });
    expect(push.body.results[0].status).toBe("applied");
  });

  it("métricas solo para el equipo; registra actividad diaria una vez", async () => {
    const owner = await createOrgWithOwner();
    expect((await call("GET", "/admin/metrics", { token: owner.token })).status).toBe(403);
    await call("GET", "/me", { token: owner.token });
    await call("GET", "/me", { token: owner.token });
    expect(await db().select().from(s.activityDaily).where(eq(s.activityDaily.userId, owner.userId))).toHaveLength(1);

    const ts = Date.now();
    const staffId = newId();
    await db()
      .insert(s.users)
      .values({ id: staffId, email: "staff@yvy.test", fullName: "Equipo", createdAt: ts, updatedAt: ts });
    await db().insert(s.memberships).values({
      id: newId(),
      organizationId: owner.orgId,
      userId: staffId,
      role: "admin",
      createdAt: ts,
      updatedAt: ts,
    });
    const staff = await issueSession(db(), env.JWT_SECRET, staffId);
    const m = await call("GET", "/admin/metrics", { token: staff!.accessToken });
    expect(m.status).toBe(200);
    const org = m.body.organizations.find((o: { id: string }) => o.id === owner.orgId);
    expect(org).toMatchObject({ owners: 2 });
    expect((await call("GET", "/me", { token: staff!.accessToken })).body.isStaff).toBe(true);
    expect(
      (await call("POST", `/admin/orgs/${owner.orgId}/plan`, { token: staff!.accessToken, body: { plan: "active" } }))
        .status,
    ).toBe(200);
  });
});

describe("V-02 · demo pública de solo lectura", () => {
  const req = (method: string, path: string, e: object) =>
    app.request(path, { method, headers: { "content-type": "application/json" } }, e);

  it("sin DEMO_ORG_ID y DEMO_USER_ID el endpoint responde 404", async () => {
    expect((await req("POST", "/auth/demo", env)).status).toBe(404);
    expect((await req("GET", "/auth/demo", env)).status).toBe(404);
  });

  it("emite sesión de dueño que solo puede leer", async () => {
    const owner = await createOrgWithOwner("Estancia de ejemplo");
    const demoEnv = { ...env, DEMO_ORG_ID: owner.orgId, DEMO_USER_ID: owner.userId };
    // La organización todavía no es 'demo': no se entrega una sesión de escritura.
    expect((await req("POST", "/auth/demo", demoEnv)).status).toBe(404);
    await db().update(s.organizations).set({ plan: "demo" }).where(eq(s.organizations.id, owner.orgId));

    expect(await (await req("GET", "/auth/demo", demoEnv)).json()).toEqual({ available: true });
    const res = await req("POST", "/auth/demo", demoEnv);
    expect(res.status).toBe(200);
    const session = (await res.json()) as { accessToken: string; organization: { id: string; role: string } };
    expect(session.organization).toMatchObject({ id: owner.orgId, role: "owner" });

    const me = await call("GET", "/me", { token: session.accessToken });
    expect(me.body.demo).toBe(true);
    expect((await call("GET", "/org/farms", { token: session.accessToken })).status).toBe(200);

    for (const [method, path, body] of [
      ["POST", "/org/farms", { name: "x", geometry: square(-55, -27) }],
      ["POST", "/sync/push", { deviceId: "d", mutations: [] }],
      ["POST", "/auth/link", { userId: owner.userId }],
    ] as const) {
      const r = await call(method, path, { token: session.accessToken, body });
      expect(r.status, `${method} ${path}`).toBe(403);
    }
    // Una organización común no ve la marca de demo.
    const other = await createOrgWithOwner();
    expect((await call("GET", "/me", { token: other.token })).body.demo).toBe(false);
  });
});
