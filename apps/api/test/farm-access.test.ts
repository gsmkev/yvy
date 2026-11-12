/** K-05: permisos finos por estancia para administradores y agrónomos. */
import { describe, expect, it } from "vitest";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";
import { push, rec } from "./records-helpers";

async function setup(role: "admin" | "agronomist" = "admin") {
  const owner = await createOrgWithOwner();
  const a = await createFarmWithPlots(owner.token, 2);
  const b = await createFarmWithPlots(owner.token, 2);
  const member = await addMemberAndLogin(owner.token, role, "Fina");
  const set = (farms: { farmId: string; level?: "view" | "edit" }[]) =>
    call("PUT", `/org/members/${member.userId}/farms`, { token: owner.token, body: { farms } });
  return { owner, a, b, member, set };
}

describe("K-05 · permisos por estancia", () => {
  it("sin lista el administrador ve todo, como siempre", async () => {
    const { a, b, member } = await setup();
    const ids = (await pullAll(member.token, "farms")).map((f) => f.id).sort();
    expect(ids).toEqual([a.farmId, b.farmId].sort());
  });

  it("con lista solo ve y edita esas estancias", async () => {
    const { a, b, member, set } = await setup();
    expect((await set([{ farmId: a.farmId, level: "edit" }])).status).toBe(200);
    expect((await pullAll(member.token, "farms")).map((f) => f.id)).toEqual([a.farmId]);
    expect((await pullAll(member.token, "plots")).length).toBe(2);
    expect((await call("GET", `/org/farms/${b.farmId}`, { token: member.token })).status).toBe(404);
    // editar una estancia o lote fuera de la lista: 404
    expect((await call("PATCH", `/org/farms/${b.farmId}`, { token: member.token, body: { name: "Hackeo" } })).status).toBe(404);
    expect((await call("PATCH", `/org/plots/${b.plotIds[0]}`, { token: member.token, body: { name: "Hackeo" } })).status).toBe(404);
    expect((await call("PATCH", `/org/plots/${a.plotIds[0]}`, { token: member.token, body: { name: "Lote A" } })).status).toBe(200);
  });

  it("en una estancia de solo lectura puede ver pero no escribir", async () => {
    const { a, b, member, set } = await setup("agronomist");
    await set([
      { farmId: a.farmId, level: "view" },
      { farmId: b.farmId, level: "edit" },
    ]);
    expect((await call("GET", `/org/farms/${a.farmId}`, { token: member.token })).status).toBe(200);
    expect((await call("PATCH", `/org/plots/${a.plotIds[0]}`, { token: member.token, body: { name: "No" } })).status).toBe(404);
    expect((await call("POST", `/org/farms/${a.farmId}/pois`, { token: member.token, body: { kind: "gate", name: "Tranquera", lon: -55.9, lat: -27.2 } })).status).toBe(403);
    expect((await call("POST", `/org/farms/${b.farmId}/pois`, { token: member.token, body: { kind: "gate", name: "Tranquera", lon: -55.9, lat: -27.2 } })).status).toBe(201);
    const res = await push(member.token, [
      rec(a.farmId, null, "rain", { mm: 3, readAt: Date.now() }),
      rec(b.farmId, null, "rain", { mm: 3, readAt: Date.now() }),
    ]);
    expect((res.body as { results: { status: string }[] }).results.map((r) => r.status)).toEqual(["rejected", "applied"]);
  });

  it("el tablero y los avisos del administrador limitado cuentan solo sus estancias", async () => {
    const { owner, a, member, set } = await setup();
    const all = await call<{ areaByCrop: { ha: number }[] }>("GET", "/org/dashboard", { token: owner.token });
    await set([{ farmId: a.farmId }]);
    const mine = await call<{ areaByCrop: { ha: number }[] }>("GET", "/org/dashboard", { token: member.token });
    const sum = (r: { areaByCrop: { ha: number }[] }) => r.areaByCrop.reduce((x, c) => x + c.ha, 0);
    expect(sum(mine.body)).toBeGreaterThan(0);
    expect(sum(mine.body)).toBeLessThan(sum(all.body));
  });

  it("solo el dueño cambia la lista, y no vale para dueño ni para roles de campo", async () => {
    const { owner, a, member, set } = await setup();
    expect((await call("PUT", `/org/members/${member.userId}/farms`, { token: member.token, body: { farms: [] } })).status).toBe(403);
    expect((await set([{ farmId: a.farmId }])).status).toBe(200);
    const worker = await addMemberAndLogin(owner.token, "worker");
    expect((await call("PUT", `/org/members/${worker.userId}/farms`, { token: owner.token, body: { farms: [] } })).status).toBe(403);
    expect((await call("PUT", `/org/members/${owner.userId}/farms`, { token: owner.token, body: { farms: [] } })).status).toBe(403);
    // vaciar la lista devuelve el acceso a todas
    await set([]);
    expect((await pullAll(member.token, "farms")).length).toBe(2);
  });

  it("cambiar la lista hace que el celular rehaga sus tablas (assignmentsVersion)", async () => {
    const { a, member, set } = await setup();
    const before = await call<{ assignmentsVersion: number }>("GET", "/sync/state", { token: member.token });
    await set([{ farmId: a.farmId }]);
    const after = await call<{ assignmentsVersion: number }>("GET", "/sync/state", { token: member.token });
    expect(after.body.assignmentsVersion).toBe(before.body.assignmentsVersion + 1);
  });
});
