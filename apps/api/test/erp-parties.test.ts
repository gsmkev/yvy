/** E-02: proveedores y clientes con RUC; solo dueño y administrador. */
import { describe, expect, it } from "vitest";
import { call, createOrgWithOwner } from "./helpers";
import { erpGet, erpPost, erpSetup, expectListStatus } from "./erp-helpers";

const party = { name: "Agrofértil S.A.", ruc: "80012345-6", kind: "supplier", phone: "0981 123 456" };

describe("terceros (E-02)", () => {
  it("dueño y administrador crean, editan y borran", async () => {
    const { owner, admin } = await erpSetup();
    const a = await erpPost(owner.token, "parties", party);
    expect(a.status).toBe(201);
    expect((await erpPost(admin.token, "parties", { ...party, name: "Cliente", kind: "customer", ruc: "1234567" })).status).toBe(201);
    const list = await erpGet<any[]>(owner.token, "parties");
    expect(list.body.map((x) => x.name)).toEqual(["Agrofértil S.A.", "Cliente"]);
    expect(list.body[0]).toMatchObject({ ruc: "80012345-6", kind: "supplier" });
    const patch = await call("PATCH", `/org/erp/parties/${a.body.id}`, { token: admin.token, body: { phone: "" } });
    expect(patch.status).toBe(200);
    expect((await erpGet<any[]>(owner.token, "parties")).body[0].phone).toBeNull();
    expect((await call("DELETE", `/org/erp/parties/${a.body.id}`, { token: owner.token })).status).toBe(200);
    expect((await erpGet<any[]>(owner.token, "parties")).body).toHaveLength(1);
    expect((await call("DELETE", `/org/erp/parties/${a.body.id}`, { token: owner.token })).status).toBe(404);
  });

  it("el agrónomo y el empleado no entran", async () => {
    const { agro, worker } = await erpSetup();
    expect((await erpPost(agro.token, "parties", party)).status).toBe(403);
    expect((await erpPost(worker.token, "parties", party)).status).toBe(403);
    await expectListStatus("parties", { agro: [agro.token, 403], worker: [worker.token, 403] });
  });

  it("valida el RUC y el tipo; un PATCH parcial no borra lo que no manda", async () => {
    const { owner } = await erpSetup();
    expect((await erpPost(owner.token, "parties", { ...party, ruc: "abc" })).status).toBe(400);
    expect((await erpPost(owner.token, "parties", { ...party, kind: "otro" })).status).toBe(400);
    expect((await erpPost(owner.token, "parties", { ...party, name: " " })).status).toBe(400);
    const a = await erpPost(owner.token, "parties", party);
    await call("PATCH", `/org/erp/parties/${a.body.id}`, { token: owner.token, body: { name: "Nuevo nombre" } });
    expect((await erpGet<any[]>(owner.token, "parties")).body[0]).toMatchObject({ name: "Nuevo nombre", ruc: "80012345-6" });
  });

  it("no se ven ni se tocan terceros de otra organización", async () => {
    const { owner } = await erpSetup();
    const other = await createOrgWithOwner("Otra");
    const a = await erpPost(owner.token, "parties", party);
    expect((await erpGet<any[]>(other.token, "parties")).body).toEqual([]);
    expect((await call("PATCH", `/org/erp/parties/${a.body.id}`, { token: other.token, body: { name: "x" } })).status).toBe(404);
    expect((await call("DELETE", `/org/erp/parties/${a.body.id}`, { token: other.token })).status).toBe(404);
  });
});
