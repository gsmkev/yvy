/** T-09: supervisor (capataz) por estancia. Matriz en docs/PRD-roles.md. */
import { describe, expect, it } from "vitest";
import { can } from "../src/db/scoped";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";
import { push, rec } from "./records-helpers";

async function setup() {
  const owner = await createOrgWithOwner();
  const a = await createFarmWithPlots(owner.token, 3);
  const b = await createFarmWithPlots(owner.token, 2);
  const sup = await addMemberAndLogin(owner.token, "supervisor", "Capataz");
  const worker = await addMemberAndLogin(owner.token, "worker", "Peón");
  return { owner, a, b, sup, worker };
}
const give = (ownerToken: string, userId: string, farms: { farmId: string; level?: "view" | "edit" }[]) =>
  call("PUT", `/org/members/${userId}/farms`, { token: ownerToken, body: { farms } });

describe("T-09 · matriz de permisos del supervisor", () => {
  it("no gestiona la organización pero sí asigna y edita el campo", () => {
    expect(can.manageOrg("supervisor")).toBe(false);
    expect(can.manageWorkers("supervisor")).toBe(false);
    expect(can.manageFarmAccess("supervisor")).toBe(false);
    expect(can.shareLinks("supervisor")).toBe(false);
    expect(can.dashboard("supervisor")).toBe(false);
    expect(can.alertSettings("supervisor")).toBe(false);
    expect(can.editSeasons("supervisor")).toBe(false);
    expect(can.editProducts("supervisor")).toBe(false);
    expect(can.assign("supervisor")).toBe(true);
    expect(can.editField("supervisor")).toBe(true);
    expect(can.viewAll("supervisor")).toBe(true);
    expect(can.reports("supervisor")).toBe(true);
  });
});

describe("T-09 · supervisor", () => {
  it("sin estancias asignadas no ve nada; con una, solo esa", async () => {
    const { owner, a, b, sup } = await setup();
    expect(await pullAll(sup.token, "farms")).toEqual([]);
    expect((await call<unknown[]>("GET", "/org/farms", { token: sup.token })).body).toEqual([]);

    expect((await give(owner.token, sup.userId, [{ farmId: a.farmId }])).status).toBe(200);
    expect((await pullAll(sup.token, "farms")).map((f) => f.id)).toEqual([a.farmId]);
    expect((await pullAll(sup.token, "plots")).map((p) => p.id).sort()).toEqual([...a.plotIds].sort());
    const list = await call<{ id: string }[]>("GET", "/org/farms", { token: sup.token });
    expect(list.body.map((f) => f.id)).toEqual([a.farmId]);
    expect((await call("GET", `/org/farms/${b.farmId}`, { token: sup.token })).status).toBe(404);
    expect((await call("GET", `/org/farms/${a.farmId}`, { token: sup.token })).status).toBe(200);
  });

  it("asigna tareas y lotes dentro de su estancia y no fuera", async () => {
    const { owner, a, b, sup, worker } = await setup();
    await give(owner.token, sup.userId, [{ farmId: a.farmId }]);
    const task = (farmId: string, plotId: string) => ({
      farmId,
      plotId,
      assigneeId: worker.userId,
      title: "Revisar",
      dueDate: "2030-01-10",
    });
    expect((await call("POST", "/org/tasks", { token: sup.token, body: task(a.farmId, a.plotIds[0]!) })).status).toBe(201);
    expect((await call("POST", "/org/tasks", { token: sup.token, body: task(b.farmId, b.plotIds[0]!) })).status).toBe(404);

    const ok = await call("PUT", `/org/members/${worker.userId}/plots`, {
      token: sup.token,
      body: { plotIds: [a.plotIds[0]] },
    });
    expect(ok.status).toBe(200);
    const bad = await call("PUT", `/org/members/${worker.userId}/plots`, {
      token: sup.token,
      body: { plotIds: [b.plotIds[0]] },
    });
    expect(bad.status).toBe(404);
    // las tareas de la otra estancia no le llegan
    const tasks = await pullAll(sup.token, "tasks");
    expect(tasks.every((t) => t.farmId === a.farmId)).toBe(true);
  });

  it("no crea estancias, miembros, productos ni campañas, ni ve el tablero", async () => {
    const { owner, a, sup } = await setup();
    await give(owner.token, sup.userId, [{ farmId: a.farmId }]);
    const geometry = {
      type: "Polygon",
      coordinates: [
        [
          [-56, -27],
          [-55.9, -27],
          [-55.9, -27.1],
          [-56, -27.1],
          [-56, -27],
        ],
      ],
    };
    expect((await call("POST", "/org/farms", { token: sup.token, body: { name: "Nueva", geometry } })).status).toBe(403);
    expect((await call("POST", "/org/members", { token: sup.token, body: { fullName: "Xavi", role: "worker" } })).status).toBe(403);
    expect((await call("GET", "/org/dashboard", { token: sup.token })).status).toBe(403);
    expect(
      (await call("POST", "/org/products", { token: sup.token, body: { name: "Glifo", type: "agrochemical", unit: "l" } })).status,
    ).toBe(403);
    expect((await call("PUT", `/org/members/${sup.userId}/farms`, { token: sup.token, body: { farms: [] } })).status).toBe(403);
    expect((await call("GET", "/org/farm-access", { token: sup.token })).status).toBe(403);
  });

  it("por sync solo escribe registros de su estancia", async () => {
    const { owner, a, b, sup } = await setup();
    await give(owner.token, sup.userId, [{ farmId: a.farmId }]);
    const res = await push(sup.token, [
      rec(a.farmId, a.plotIds[0]!, "rain", { mm: 5, readAt: Date.now() }),
      rec(b.farmId, null, "rain", { mm: 5, readAt: Date.now() }),
    ]);
    const r = (res.body as { results: { status: string }[] }).results;
    expect(r.map((x) => x.status)).toEqual(["applied", "rejected"]);
  });

  it("el dueño ve las estancias del supervisor y no puede darle una de otra organización", async () => {
    const { owner, a, sup } = await setup();
    await give(owner.token, sup.userId, [{ farmId: a.farmId }]);
    const rows = await call<{ userId: string; farmId: string; level: string }[]>("GET", "/org/farm-access", {
      token: owner.token,
    });
    expect(rows.body).toEqual([{ userId: sup.userId, farmId: a.farmId, level: "edit" }]);
    const other = await createOrgWithOwner("Otra");
    const foreign = await createFarmWithPlots(other.token, 1);
    expect((await give(owner.token, sup.userId, [{ farmId: foreign.farmId }])).status).toBe(404);
  });
});
