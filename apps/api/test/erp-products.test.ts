/** E-01: catálogo de productos y permisos de la administración (ERP). */
import { describe, expect, it } from "vitest";
import { addMemberAndLogin, call, createOrgWithOwner } from "./helpers";

const body = {
  name: "Glifosato 48",
  type: "agrochemical",
  unit: "l",
  activeIngredient: "Glifosato",
  withdrawalDays: 7,
  toxClass: "III",
};

describe("productos (E-01)", () => {
  it("guarda tipo, unidad, principio activo, carencia y clase toxicológica", async () => {
    const owner = await createOrgWithOwner();
    const r = await call<{ id: string }>("POST", "/org/products", { token: owner.token, body });
    expect(r.status).toBe(201);
    const list = await call<any[]>("GET", "/org/products", { token: owner.token });
    expect(list.body[0]).toMatchObject(body);
  });

  it("valida tipo, unidad y carencia", async () => {
    const owner = await createOrgWithOwner();
    for (const bad of [{ type: "otro_tipo" }, { unit: "gal" }, { withdrawalDays: -1 }, { name: " " }]) {
      expect((await call("POST", "/org/products", { token: owner.token, body: { ...body, ...bad } })).status).toBe(400);
    }
  });

  it("el agrónomo edita el catálogo; el empleado lo ve pero no lo toca", async () => {
    const owner = await createOrgWithOwner();
    const agro = await addMemberAndLogin(owner.token, "agronomist", "Ing. Agrónoma");
    const worker = await addMemberAndLogin(owner.token, "worker");
    expect((await call("POST", "/org/products", { token: agro.token, body })).status).toBe(201);
    expect((await call("POST", "/org/products", { token: worker.token, body })).status).toBe(403);
    const list = await call<any[]>("GET", "/org/products", { token: worker.token });
    expect(list.body).toHaveLength(1);
    expect((await call("DELETE", `/org/products/${list.body[0].id}`, { token: worker.token })).status).toBe(403);
  });

  it("no se ven productos de otra organización", async () => {
    const owner = await createOrgWithOwner();
    const other = await createOrgWithOwner("Otra");
    await call("POST", "/org/products", { token: owner.token, body });
    expect((await call<any[]>("GET", "/org/products", { token: other.token })).body).toEqual([]);
  });
});
