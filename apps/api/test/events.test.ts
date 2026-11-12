import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { LIMITS, localDate, newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { CRONS, scheduled } from "../src/jobs";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, createStaff, db, square } from "./helpers";

afterEach(() => vi.restoreAllMocks());
// la base se comparte entre las pruebas del archivo: cada una empieza sin cuentas diarias
beforeEach(async () => {
  await db().delete(s.eventsDaily);
});

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

  const days = async () => await db().select().from(s.eventsDaily);

  it("POST /events: requiere sesión, valida el nombre y suma por día y pantalla, sin guardar quién", async () => {
    const owner = await createOrgWithOwner();
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect((await call("POST", "/events", { body: { name: "view:mapa" } })).status).toBe(401);
    expect((await call("POST", "/events", { token: owner.token, body: { name: "view:mapa" } })).status).toBe(202);
    expect((await call("POST", "/events", { token: owner.token, body: { name: "view:mapa" } })).status).toBe(202);
    expect((await call("POST", "/events", { token: owner.token, body: { name: "view:tareas" } })).status).toBe(202);
    for (const name of ["Con Espacios", "x".repeat(41), "signup", "view:", "mapa", "view:Mapa"])
      expect((await call("POST", "/events", { token: owner.token, body: { name } })).status).toBe(400);
    const rows = await days();
    // una fila por pantalla (no una por visita), con el peso del muestreo, y ninguna columna de persona
    const weight = Math.round(1 / LIMITS.events.sampleRate);
    expect(rows.map((r) => [r.name, r.n]).sort()).toEqual([
      ["view:mapa", 2 * weight],
      ["view:tareas", weight],
    ]);
    expect(Object.keys(rows[0]!).sort()).toEqual(["day", "n", "name"]);
    expect(await mine(owner.orgId)).toEqual([]); // el embudo no se toca
  });

  it("POST /events: muestrea y respeta el tope diario por pantalla", async () => {
    const owner = await createOrgWithOwner();
    const rnd = vi.spyOn(Math, "random").mockReturnValue(LIMITS.events.sampleRate + 0.01);
    const dropped = await call<{ recorded: boolean }>("POST", "/events", { token: owner.token, body: { name: "view:x" } });
    expect(dropped.body.recorded).toBe(false);
    expect(await days()).toEqual([]);
    rnd.mockReturnValue(0);
    const today = localDate(Date.now());
    await db().insert(s.eventsDaily).values({ day: today, name: "view:x", n: LIMITS.events.maxPerNamePerDay });
    const capped = await call<{ recorded: boolean }>("POST", "/events", { token: owner.token, body: { name: "view:x" } });
    expect(capped.status).toBe(202);
    expect(capped.body.recorded).toBe(false);
    expect((await days()).find((r) => r.name === "view:x")!.n).toBe(LIMITS.events.maxPerNamePerDay);
  });

  it("el mantenimiento borra las cuentas diarias viejas y deja los pasos del embudo", async () => {
    const owner = await createOrgWithOwner();
    const old = Date.now() - LIMITS.events.retentionMs - 86_400_000;
    await db().insert(s.events).values({ id: newId(), name: "signup", organizationId: owner.orgId, ts: old });
    await db().insert(s.eventsDaily).values([
      { day: localDate(old), name: "view:viejo", n: 4 },
      { day: localDate(Date.now()), name: "view:nuevo", n: 2 },
    ]);
    await scheduled({ cron: CRONS.maintenance }, env, { fetch, now: Date.now });
    expect(await mine(owner.orgId)).toEqual(["signup"]);
    expect((await days()).map((r) => r.name)).toEqual(["view:nuevo"]);
  });

  it("el panel interno muestra el embudo por cohorte y las pantallas más vistas; el dueño no", async () => {
    const staff = await createStaff();
    const a = await createOrgWithOwner("A");
    const b = await createOrgWithOwner("B");
    const ts = Date.now();
    const ev = (orgId: string, name: string, at = ts) => ({ id: newId(), name, organizationId: orgId, ts: at });
    await db().insert(s.events).values([
      ev(a.orgId, "signup"),
      ev(a.orgId, "farm_created"),
      ev(a.orgId, "plots_created"),
      ev(b.orgId, "signup"),
      ev(b.orgId, "farm_created"),
    ]);
    const today = localDate(ts);
    await db().insert(s.eventsDaily).values([
      { day: today, name: "view:tareas", n: 6 },
      { day: today, name: "view:mapa", n: 2 },
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
    expect(r.body.views).toEqual([
      { name: "view:tareas", n: 6 },
      { name: "view:mapa", n: 2 },
    ]);
    expect(r.body.daily).toEqual([{ day: today, n: 8 }]);
  });
});
