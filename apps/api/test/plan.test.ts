import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { issueSession } from "../src/auth/session";
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
    await db()
      .insert(s.memberships)
      .values({
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
