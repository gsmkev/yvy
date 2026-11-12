/** E-10: depósitos por estancia, con uno predeterminado. */
import { describe, expect, it } from "vitest";
import { call, createFarmWithPlots, createOrgWithOwner } from "./helpers";
import { erpGet, erpPost, erpSetup } from "./erp-helpers";

describe("depósitos (E-10)", () => {
  it("el primero de la estancia queda predeterminado; marcar otro le quita la marca al anterior", async () => {
    const { owner, farmId } = await erpSetup();
    const a = await erpPost(owner.token, "warehouses", { farmId, name: "Galpón central", type: "shed" });
    const b = await erpPost(owner.token, "warehouses", { farmId, name: "Tanque de gasoil", type: "tank" });
    expect(a.status).toBe(201);
    let list = (await erpGet<any[]>(owner.token, "warehouses")).body;
    expect(Object.fromEntries(list.map((w) => [w.name, w.isDefault]))).toEqual({ "Galpón central": true, "Tanque de gasoil": false });
    await call("PATCH", `/org/erp/warehouses/${b.body.id}`, { token: owner.token, body: { isDefault: true } });
    list = (await erpGet<any[]>(owner.token, "warehouses")).body;
    expect(Object.fromEntries(list.map((w) => [w.name, w.isDefault]))).toEqual({ "Galpón central": false, "Tanque de gasoil": true });
  });

  it("cada estancia tiene su propio predeterminado", async () => {
    const { owner, farmId } = await erpSetup();
    const second = await createFarmWithPlots(owner.token, 1);
    await erpPost(owner.token, "warehouses", { farmId, name: "A", type: "shed" });
    await erpPost(owner.token, "warehouses", { farmId: second.farmId, name: "B", type: "silo" });
    const list = (await erpGet<any[]>(owner.token, "warehouses")).body;
    expect(list.map((w) => w.isDefault)).toEqual([true, true]);
  });

  it("valida tipo y que la estancia sea de la organización", async () => {
    const { owner, farmId } = await erpSetup();
    const other = await createOrgWithOwner("Otra");
    const foreign = await createFarmWithPlots(other.token, 1);
    expect((await erpPost(owner.token, "warehouses", { farmId, name: "X", type: "bodega" })).status).toBe(400);
    expect((await erpPost(owner.token, "warehouses", { name: "X", type: "shed" })).status).toBe(400);
    expect((await erpPost(owner.token, "warehouses", { farmId: foreign.farmId, name: "X", type: "shed" })).status).toBe(404);
  });

  it("el agrónomo los ve pero no los edita; el empleado no entra", async () => {
    const { owner, agro, worker, farmId } = await erpSetup();
    const a = await erpPost(owner.token, "warehouses", { farmId, name: "Galpón", type: "shed" });
    expect((await erpGet<any[]>(agro.token, "warehouses")).body).toHaveLength(1);
    expect((await erpPost(agro.token, "warehouses", { farmId, name: "Otro", type: "shed" })).status).toBe(403);
    expect((await call("DELETE", `/org/erp/warehouses/${a.body.id}`, { token: agro.token })).status).toBe(403);
    expect((await erpGet(worker.token, "warehouses")).status).toBe(403);
    expect((await erpPost(worker.token, "warehouses", { farmId, name: "Otro", type: "shed" })).status).toBe(403);
  });
});
