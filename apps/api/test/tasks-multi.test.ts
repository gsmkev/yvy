import { describe, expect, it } from "vitest";
import { LIMITS, newId } from "@yvy/shared";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";

describe("asignar tareas eligiendo lotes en el mapa (T-01)", () => {
  async function setup() {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 4);
    const worker = await addMemberAndLogin(owner.token, "worker");
    const post = (token: string, over: Record<string, unknown>) =>
      call<{ id: string; ids: string[] }>("POST", "/org/tasks", {
        token,
        body: { farmId, assigneeId: worker.userId, title: "Revisar bebederos", dueDate: "2026-11-20", ...over },
      });
    return { owner, worker, farmId, plotIds, post };
  }

  it("crea una tarea por lote elegido, todas con los mismos datos", async () => {
    const { owner, worker, plotIds, post } = await setup();
    const r = await post(owner.token, { plotIds: [plotIds[0], plotIds[2], plotIds[3]], priority: "high", dueTime: "10:00" });
    expect(r.status).toBe(201);
    expect(r.body.ids).toHaveLength(3);
    expect(r.body.id).toBe(r.body.ids[0]);
    const rows = await pullAll(worker.token, "tasks");
    expect(rows.map((x) => x.plotId).sort()).toEqual([plotIds[0], plotIds[2], plotIds[3]].sort());
    expect(rows.every((x) => x.title === "Revisar bebederos" && x.priority === "high" && x.dueTime === "10:00")).toBe(
      true,
    );
  });

  it("sin plotIds sigue creando una sola tarea (con o sin lote); los repetidos cuentan una vez", async () => {
    const { owner, worker, plotIds, post } = await setup();
    expect((await post(owner.token, {})).body.ids).toHaveLength(1);
    expect((await post(owner.token, { plotId: plotIds[1] })).body.ids).toHaveLength(1);
    expect((await post(owner.token, { plotIds: [plotIds[0], plotIds[0]] })).body.ids).toHaveLength(1);
    expect(await pullAll(worker.token, "tasks")).toHaveLength(3);
  });

  it("rechaza lotes de otra organización, inexistentes, listas vacías o demasiado largas", async () => {
    const { owner, plotIds, post } = await setup();
    const stranger = await createOrgWithOwner("Otra");
    const theirs = await createFarmWithPlots(stranger.token, 1);
    expect((await post(owner.token, { plotIds: [plotIds[0], theirs.plotIds[0]] })).status).toBe(404);
    expect((await post(owner.token, { plotId: theirs.plotIds[0] })).status).toBe(404);
    expect((await post(owner.token, { plotIds: [newId()] })).status).toBe(404);
    expect((await post(owner.token, { plotIds: [] })).status).toBe(400);
    const many = Array.from({ length: LIMITS.tasks.maxPlotsPerBatch + 1 }, () => newId());
    expect((await post(owner.token, { plotIds: many })).status).toBe(400);
    // No quedó nada a medias
    expect(await pullAll(owner.token, "tasks")).toHaveLength(0);
  });

  it("el empleado no crea tareas", async () => {
    const { worker, plotIds, post } = await setup();
    expect((await post(worker.token, { plotIds: [plotIds[0]] })).status).toBe(403);
  });
});
