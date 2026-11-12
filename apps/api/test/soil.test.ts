import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";

const sample = (over: Record<string, unknown> = {}) => ({
  sampledOn: "2026-10-05",
  depthCm: 20,
  lab: "Laboratorio Suelos SA",
  ph: 5.4,
  pMgKg: 9.5,
  kCmolKg: 0.22,
  omPct: 2.1,
  ...over,
});

describe("A-30 · análisis de suelo", () => {
  it("se carga por lote o por punto, se lista, edita y borra", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    const a = await call<{ id: string }>("POST", `/org/farms/${farmId}/soil-samples`, {
      token: owner.token,
      body: sample({ plotId: plotIds[0] }),
    });
    expect(a.status).toBe(201);
    const b = await call("POST", `/org/farms/${farmId}/soil-samples`, {
      token: owner.token,
      body: sample({ pointLabel: "P-07", lon: -55.89, lat: -27.21, ph: null, sampledOn: "2026-10-06" }),
    });
    expect(b.status).toBe(201);
    const list = await call<any[]>("GET", `/org/farms/${farmId}/soil-samples`, { token: owner.token });
    expect(list.body.map((x) => x.pointLabel ?? x.plotName)).toEqual(["P-07", "Lote 1"]);
    expect(list.body[1]).toMatchObject({ ph: 5.4, pMgKg: 9.5, kCmolKg: 0.22, omPct: 2.1, depthCm: 20 });
    expect((await call("PATCH", `/org/soil-samples/${a.body.id}`, { token: owner.token, body: { ph: 6.1, note: "" } })).status).toBe(200);
    expect((await call<any[]>("GET", `/org/farms/${farmId}/soil-samples`, { token: owner.token })).body[1]).toMatchObject({ ph: 6.1, note: null });
    expect((await call("DELETE", `/org/soil-samples/${a.body.id}`, { token: owner.token })).status).toBe(200);
    expect((await call<any[]>("GET", `/org/farms/${farmId}/soil-samples`, { token: owner.token })).body).toHaveLength(1);
  });

  it("valida rangos, que haya algún valor y el lote de la estancia", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const other = await createFarmWithPlots(owner.token, 1);
    const post = (body: unknown) => call("POST", `/org/farms/${farmId}/soil-samples`, { token: owner.token, body });
    expect((await post(sample({ ph: 15 }))).status).toBe(400);
    expect((await post(sample({ sampledOn: "ayer" }))).status).toBe(400);
    expect((await post({ sampledOn: "2026-10-05", depthCm: 20 })).status).toBe(400);
    expect((await post(sample({ lon: -55.9 }))).status).toBe(400);
    expect((await post(sample({ plotId: other.plotIds[0] }))).status).toBe(404);
    expect((await post(sample({ plotId: plotIds[0] }))).status).toBe(201);
  });

  it("el empleado no lee ni escribe; otra organización no ve nada", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const made = await call<{ id: string }>("POST", `/org/farms/${farmId}/soil-samples`, { token: owner.token, body: sample() });
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    expect((await call("GET", `/org/farms/${farmId}/soil-samples`, { token: worker.token })).status).toBe(403);
    expect((await call("POST", `/org/farms/${farmId}/soil-samples`, { token: worker.token, body: sample() })).status).toBe(403);
    expect((await call("PATCH", `/org/soil-samples/${made.body.id}`, { token: worker.token, body: { ph: 7 } })).status).toBe(403);
    expect((await call("DELETE", `/org/soil-samples/${made.body.id}`, { token: worker.token })).status).toBe(403);
    const agro = await addMemberAndLogin(owner.token, "agronomist", "Ing.");
    expect((await call("POST", `/org/farms/${farmId}/soil-samples`, { token: agro.token, body: sample() })).status).toBe(201);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/soil-samples`, { token: other.token })).status).toBe(404);
    expect((await call("DELETE", `/org/soil-samples/${made.body.id}`, { token: other.token })).status).toBe(404);
  });

  it("al borrar la estancia se borran sus análisis", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    await call("POST", `/org/farms/${farmId}/soil-samples`, { token: owner.token, body: sample() });
    expect((await call("DELETE", `/org/farms/${farmId}`, { token: owner.token })).status).toBe(200);
    const rows = await db().select().from(s.soilSamples).where(eq(s.soilSamples.farmId, farmId));
    expect(rows[0]!.deletedAt).not.toBeNull();
  });
});
