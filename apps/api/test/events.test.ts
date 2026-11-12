import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { LIMITS, newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { CRONS, scheduled } from "../src/jobs";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, createStaff, db, square } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const mine = async (orgId: string) =>
  (await db().select().from(s.events).where(eq(s.events.organizationId, orgId))).map((e) => e.name).sort();

describe("analítica propia (P-03)", () => {
  it("el embudo se escribe una sola vez por organización, en cada paso", async () => {
    const owner = await createOrgWithOwner(); // helper: no pasa por /auth/signup
    expect(await mine(owner.orgId)).toEqual([]);
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    expect(await mine(owner.orgId)).toEqual(["farm_created", "plots_created"]);
    // más estancias y lotes no repiten el paso
    await call("POST", "/org/farms", { token: owner.token, body: { name: "Otra", geometry: square(-56, -27, 0.05) } });
    await call("POST", `/org/farms/${farmId}/plots`, {
      token: owner.token,
      body: { plots: [{ name: "Z", kind: "crop", geometry: square(-55.7, -27.01, 0.01) }] },
    });
    expect(await mine(owner.orgId)).toEqual(["farm_created", "plots_created"]);
    const worker = await addMemberAndLogin(owner.token, "worker");
    await addMemberAndLogin(owner.token, "worker", "Otro");
    expect(await mine(owner.orgId)).toEqual(["farm_created", "member_added", "plots_created"]);
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]] } });

    const rec = (id: string) => ({
      mutationId: newId(),
      kind: "records.upsert",
      row: {
        id,
        farmId,
        plotId: plotIds[0],
        poiId: null,
        kind: "scouting",
        data: { condition: "good", note: "todo bien" },
        schemaVersion: RECORD_SCHEMA_VERSION,
        lon: -55.89,
        lat: -27.21,
        gpsAccuracyM: 5,
        capturedAt: Date.now(),
      },
    });
    const push = await call<any>("POST", "/sync/push", {
      token: worker.token,
      body: { deviceId: "d", mutations: [rec(newId()), rec(newId())] },
    });
    expect(push.body.results.map((r: { status: string }) => r.status)).toEqual(["applied", "applied"]);
    expect(await mine(owner.orgId)).toEqual(["farm_created", "first_record", "member_added", "plots_created"]);
    await call("POST", "/sync/push", { token: worker.token, body: { deviceId: "d", mutations: [rec(newId())] } });
    expect((await mine(owner.orgId)).filter((n) => n === "first_record")).toHaveLength(1);
  });

  it("POST /events: requiere sesión, valida el nombre y reserva los del embudo", async () => {
    const owner = await createOrgWithOwner();
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect((await call("POST", "/events", { body: { name: "view:mapa" } })).status).toBe(401);
    expect((await call("POST", "/events", { token: owner.token, body: { name: "view:mapa" } })).status).toBe(202);
    expect((await call("POST", "/events", { token: owner.token, body: { name: "Con Espacios" } })).status).toBe(400);
    expect((await call("POST", "/events", { token: owner.token, body: { name: "x".repeat(41) } })).status).toBe(400);
    expect((await call("POST", "/events", { token: owner.token, body: { name: "signup" } })).status).toBe(400);
    expect(await mine(owner.orgId)).toEqual(["view:mapa"]);
  });

  it("POST /events: muestrea y limita por usuario", async () => {
    const owner = await createOrgWithOwner();
    const rnd = vi.spyOn(Math, "random").mockReturnValue(LIMITS.events.sampleRate + 0.01);
    const dropped = await call<{ recorded: boolean }>("POST", "/events", { token: owner.token, body: { name: "view:x" } });
    expect(dropped.body.recorded).toBe(false);
    expect(await mine(owner.orgId)).toEqual([]);
    rnd.mockReturnValue(0);
    for (let i = 0; i < LIMITS.events.perUserPerMinute; i++)
      expect((await call("POST", "/events", { token: owner.token, body: { name: "view:x" } })).status).toBe(202);
    expect((await call("POST", "/events", { token: owner.token, body: { name: "view:x" } })).status).toBe(429);
  });

  it("el mantenimiento borra los eventos de uso viejos y deja los del embudo", async () => {
    const owner = await createOrgWithOwner();
    const old = Date.now() - LIMITS.events.retentionMs - 86_400_000;
    await db().insert(s.events).values([
      { id: newId(), name: "view:viejo", userId: owner.userId, organizationId: owner.orgId, ts: old },
      { id: newId(), name: "signup", userId: owner.userId, organizationId: owner.orgId, ts: old },
    ]);
    await scheduled({ cron: CRONS.maintenance }, env, { fetch, now: Date.now });
    expect(await mine(owner.orgId)).toEqual(["signup"]);
  });

  it("el panel interno muestra el embudo por cohorte y las pantallas más vistas; el dueño no", async () => {
    const staff = await createStaff();
    const a = await createOrgWithOwner("A");
    const b = await createOrgWithOwner("B");
    const ts = Date.now();
    const ev = (orgId: string, userId: string, name: string, at = ts) => ({ id: newId(), name, userId, organizationId: orgId, ts: at });
    await db().insert(s.events).values([
      ev(a.orgId, a.userId, "signup"),
      ev(a.orgId, a.userId, "farm_created"),
      ev(a.orgId, a.userId, "plots_created"),
      ev(b.orgId, b.userId, "signup"),
      ev(b.orgId, b.userId, "farm_created"),
      ev(a.orgId, a.userId, "view:tareas"),
      ev(b.orgId, b.userId, "view:tareas"),
      ev(a.orgId, a.userId, "view:mapa"),
    ]);
    expect((await call("GET", "/admin/funnel", { token: a.token })).status).toBe(403);
    const r = await call<any>("GET", "/admin/funnel?days=1", { token: staff.token });
    const orgs = Object.fromEntries(r.body.steps.map((x: { name: string; orgs: number }) => [x.name, x.orgs]));
    expect(orgs.signup).toBeGreaterThanOrEqual(2);
    expect(orgs.farm_created).toBeGreaterThanOrEqual(2);
    expect(orgs.plots_created).toBeGreaterThanOrEqual(1);
    expect(orgs.member_added).toBe(0);
    expect(r.body.steps.map((x: { name: string }) => x.name)).toEqual([
      "signup",
      "farm_created",
      "plots_created",
      "member_added",
      "first_record",
    ]);
    expect(r.body.views.find((v: { name: string }) => v.name === "view:tareas")).toMatchObject({ n: 2, users: 2 });
  });
});
