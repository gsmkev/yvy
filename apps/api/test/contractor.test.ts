/** K-03: contratista externo con acceso a ciertos lotes y tareas. */
import { describe, expect, it } from "vitest";
import { can } from "../src/db/scoped";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";
import { push, rec } from "./records-helpers";

describe("K-03 · matriz del contratista", () => {
  it("tiene los mismos límites que el empleado", () => {
    for (const k of Object.keys(can) as (keyof typeof can)[]) {
      expect(can[k]("contractor"), k).toBe(can[k]("worker"));
    }
  });
});

describe("K-03 · contratista", () => {
  async function setup() {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 4);
    const contractor = await addMemberAndLogin(owner.token, "contractor", "Fumigadora SA");
    const worker = await addMemberAndLogin(owner.token, "worker", "Peón");
    await call("PUT", `/org/members/${contractor.userId}/plots`, { token: owner.token, body: { plotIds: plotIds.slice(0, 1) } });
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    return { owner, farmId, plotIds, contractor, worker };
  }

  it("el dueño lo crea sin email y un administrador también", async () => {
    const owner = await createOrgWithOwner();
    const admin = await addMemberAndLogin(owner.token, "admin");
    const r = await call("POST", "/org/members", { token: admin.token, body: { fullName: "Contratista", role: "contractor" } });
    expect(r.status).toBe(201);
    const bad = await call("POST", "/org/members", { token: admin.token, body: { fullName: "Otro Admin", role: "supervisor", email: "x@y.py" } });
    expect(bad.status).toBe(403);
  });

  it("solo ve el lote asignado y sus tareas, no las de otros", async () => {
    const { owner, farmId, plotIds, contractor, worker } = await setup();
    expect((await pullAll(contractor.token, "plots")).map((p) => p.id)).toEqual([plotIds[0]]);
    expect((await pullAll(contractor.token, "farms")).map((f) => f.id)).toEqual([farmId]);
    const mk = (assigneeId: string, plotId: string) =>
      call("POST", "/org/tasks", { token: owner.token, body: { farmId, plotId, assigneeId, title: "Pulverizar", dueDate: "2030-02-01" } });
    await mk(contractor.userId, plotIds[0]!);
    await mk(worker.userId, plotIds[0]!);
    const tasks = await pullAll(contractor.token, "tasks");
    expect(tasks.length).toBe(1);
    expect(tasks[0].assigneeId).toBe(contractor.userId);
  });

  it("no baja campañas ni catálogo de productos, ni el vigor", async () => {
    const { owner, contractor } = await setup();
    await call("POST", "/org/products", { token: owner.token, body: { name: "Glifosato", type: "agrochemical", unit: "l" } });
    expect((await pullAll(owner.token, "products")).length).toBe(1);
    expect(await pullAll(contractor.token, "products")).toEqual([]);
    expect(await pullAll(contractor.token, "seasons")).toEqual([]);
    expect(await pullAll(contractor.token, "plot_index_stats")).toEqual([]);
  });

  it("solo ve los registros que cargó él, aunque otros carguen en su lote", async () => {
    const { farmId, plotIds, contractor, worker } = await setup();
    await push(worker.token, [rec(farmId, plotIds[0]!, "rain", { mm: 10, readAt: Date.now() })]);
    expect(await pullAll(contractor.token, "records")).toEqual([]);
    const res = await push(contractor.token, [rec(farmId, plotIds[0]!, "rain", { mm: 4, readAt: Date.now() })]);
    expect((res.body as { results: { status: string }[] }).results[0]!.status).toBe("applied");
    expect((await pullAll(contractor.token, "records")).length).toBe(1);
  });

  it("no escribe en lotes ajenos ni gestiona nada", async () => {
    const { farmId, plotIds, contractor } = await setup();
    const res = await push(contractor.token, [rec(farmId, plotIds[2]!, "rain", { mm: 4, readAt: Date.now() })]);
    expect((res.body as { results: { status: string }[] }).results[0]!.status).toBe("rejected");
    expect((await call("GET", "/org/members", { token: contractor.token })).status).toBe(403);
    expect((await call("POST", "/org/tasks", { token: contractor.token, body: { farmId, assigneeId: contractor.userId, title: "x", dueDate: "2030-01-01" } })).status).toBe(403);
    expect((await call("GET", "/org/dashboard", { token: contractor.token })).status).toBe(403);
  });
});
