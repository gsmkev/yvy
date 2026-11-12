/** E-03: maquinaria; la editan dueño y administrador, la ve el agrónomo y baja al celular del empleado. */
import { describe, expect, it } from "vitest";
import { call } from "./helpers";
import { erpGet, erpPost, erpSetup } from "./erp-helpers";
import { pullAll } from "./helpers";

const tractor = { name: "John Deere 6130", type: "tractor", brand: "John Deere", model: "6130J", year: 2018, meterKind: "hours", meterValue: 4200 };

describe("maquinaria (E-03)", () => {
  it("alta con horómetro; sin lectura queda en 0", async () => {
    const { owner, farmId } = await erpSetup();
    const a = await erpPost(owner.token, "machines", { ...tractor, farmId });
    expect(a.status).toBe(201);
    const b = await erpPost(owner.token, "machines", { name: "Hilux", type: "pickup", meterKind: "km", meterValue: null });
    expect(b.status).toBe(201);
    const list = await erpGet<any[]>(owner.token, "machines");
    expect(list.body.find((m) => m.name === "Hilux")).toMatchObject({ meterKind: "km", meterValue: 0, farmId: null });
    expect(list.body.find((m) => m.name === "John Deere 6130")).toMatchObject({ meterValue: 4200, year: 2018, farmId });
  });

  it("valida tipo, año y que la estancia sea de la organización", async () => {
    const { owner } = await erpSetup();
    expect((await erpPost(owner.token, "machines", { ...tractor, type: "avion" })).status).toBe(400);
    expect((await erpPost(owner.token, "machines", { ...tractor, year: 1800 })).status).toBe(400);
    expect((await erpPost(owner.token, "machines", { ...tractor, farmId: "11111111-1111-4111-8111-111111111111" })).status).toBe(404);
  });

  it("el agrónomo las ve pero no las edita; el empleado ni las lista por la API de oficina", async () => {
    const { owner, agro, worker } = await erpSetup();
    const a = await erpPost(owner.token, "machines", tractor);
    expect((await erpPost(agro.token, "machines", tractor)).status).toBe(403);
    expect((await call("PATCH", `/org/erp/machines/${a.body.id}`, { token: agro.token, body: { meterValue: 1 } })).status).toBe(403);
    expect((await call("DELETE", `/org/erp/machines/${a.body.id}`, { token: agro.token })).status).toBe(403);
    expect((await erpGet<any[]>(agro.token, "machines")).body).toHaveLength(1);
    expect((await erpPost(worker.token, "machines", tractor)).status).toBe(403);
    expect((await erpGet(worker.token, "machines")).status).toBe(403);
  });

  it("baja al celular del empleado por la sincronización y un cambio sube la versión", async () => {
    const { owner, worker } = await erpSetup();
    const a = await erpPost(owner.token, "machines", tractor);
    const first = await pullAll(worker.token, "machines");
    expect(first.map((m) => m.name)).toEqual(["John Deere 6130"]);
    await call("PATCH", `/org/erp/machines/${a.body.id}`, { token: owner.token, body: { meterValue: 4300 } });
    const second = await pullAll(worker.token, "machines");
    expect(second[0].meterValue).toBe(4300);
    expect(second[0].version).toBeGreaterThan(first[0].version);
    await call("DELETE", `/org/erp/machines/${a.body.id}`, { token: owner.token });
    expect((await pullAll(worker.token, "machines"))[0].deletedAt).toBeGreaterThan(0);
  });
});
