import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";
import { push, rec } from "./records-helpers";

const ticket = (over: Record<string, unknown> = {}) => ({
  crop: "soja",
  ticket: "0012345",
  silo: "Silo Cooperativa Norte",
  deliveredOn: "2026-04-10",
  grossKg: 30_000,
  moisturePct: 15,
  baseMoisturePct: 13,
  impuritiesPct: 1,
  otherKg: 0,
  ...over,
});

describe("A-23 · entregas a acopio", () => {
  it("calcula el neto al guardar y resume por lote contra lo cosechado", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    await push(owner.token, [rec(farmId, plotIds[0]!, "harvest", { tons: 61 })]);
    const a = await call<{ id: string; netKg: number }>("POST", `/org/farms/${farmId}/deliveries`, {
      token: owner.token,
      body: ticket({ plotId: plotIds[0] }),
    });
    expect(a.status).toBe(201);
    // 30000 * 85/87 = 29310,3; menos 1 % de impurezas = 29017,2
    expect(a.body.netKg).toBeCloseTo(29_017.2, 0);
    await call("POST", `/org/farms/${farmId}/deliveries`, { token: owner.token, body: ticket({ plotId: plotIds[0], ticket: "0012346", moisturePct: 13, impuritiesPct: 0 }) });
    const list = await call<any>("GET", `/org/farms/${farmId}/deliveries`, { token: owner.token });
    expect(list.body.rows).toHaveLength(2);
    expect(list.body.rows[0]).toMatchObject({ silo: "Silo Cooperativa Norte", plotName: "Lote 1" });
    expect(list.body.byPlot).toHaveLength(1);
    expect(list.body.byPlot[0]).toMatchObject({ plotId: plotIds[0], deliveries: 2, grossKg: 60_000, harvestTons: 61 });
    expect(list.body.byPlot[0].netKg).toBeCloseTo(59_017, -1);
    expect((await call("DELETE", `/org/deliveries/${a.body.id}`, { token: owner.token })).status).toBe(200);
    expect((await call<any>("GET", `/org/farms/${farmId}/deliveries`, { token: owner.token })).body.rows).toHaveLength(1);
  });

  it("valida pesos, humedad y que el lote y la campaña existan", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const other = await createFarmWithPlots(owner.token, 1);
    const post = (b: unknown) => call("POST", `/org/farms/${farmId}/deliveries`, { token: owner.token, body: b });
    expect((await post(ticket({ grossKg: 0 }))).status).toBe(400);
    expect((await post(ticket({ moisturePct: 80 }))).status).toBe(400);
    expect((await post(ticket({ ticket: " " }))).status).toBe(400);
    expect((await post(ticket({ crop: "papa" }))).status).toBe(400);
    expect((await post(ticket({ plotId: other.plotIds[0] }))).status).toBe(404);
    expect((await post(ticket({ seasonId: "01a1cbc6-c1c7-7ad1-86f6-e16e35f262f7" }))).status).toBe(404);
    expect((await post(ticket({ moisturePct: null }))).status).toBe(201);
  });

  it("el empleado no ve ni escribe; el agrónomo sí; otra organización no ve nada", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const made = await call<{ id: string }>("POST", `/org/farms/${farmId}/deliveries`, { token: owner.token, body: ticket() });
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    expect((await call("GET", `/org/farms/${farmId}/deliveries`, { token: worker.token })).status).toBe(403);
    expect((await call("POST", `/org/farms/${farmId}/deliveries`, { token: worker.token, body: ticket() })).status).toBe(403);
    expect((await call("DELETE", `/org/deliveries/${made.body.id}`, { token: worker.token })).status).toBe(403);
    const agro = await addMemberAndLogin(owner.token, "agronomist", "Ing.");
    expect((await call("POST", `/org/farms/${farmId}/deliveries`, { token: agro.token, body: ticket() })).status).toBe(201);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/deliveries`, { token: other.token })).status).toBe(404);
    expect((await call("DELETE", `/org/deliveries/${made.body.id}`, { token: other.token })).status).toBe(404);
  });

  it("al borrar la estancia se borran sus entregas", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    await call("POST", `/org/farms/${farmId}/deliveries`, { token: owner.token, body: ticket() });
    await call("DELETE", `/org/farms/${farmId}`, { token: owner.token });
    const rows = await db().select().from(s.grainDeliveries).where(eq(s.grainDeliveries.farmId, farmId));
    expect(rows[0]!.deletedAt).not.toBeNull();
  });
});
