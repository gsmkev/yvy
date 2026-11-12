import { describe, expect, it } from "vitest";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";

describe("S-09 · tarea con punto desde un área problema", () => {
  it("el agrónomo la crea con lon y lat y le llega al empleado del lote por sync", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    const agro = await addMemberAndLogin(owner.token, "agronomist");

    const body = {
      farmId,
      plotId: plotIds[0],
      assigneeId: worker.userId,
      title: "Recorrer 1,2 ha de Lote 1 con vigor bajo",
      kind: "scouting",
      dueDate: "2026-11-11",
      recurrence: "none",
      lon: -55.895,
      lat: -27.205,
    };
    const res = await call("POST", "/org/tasks", { token: agro.token, body });
    expect(res.status).toBe(201);
    const tasks = await pullAll(worker.token, "tasks");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ lon: -55.895, lat: -27.205, assigneeId: worker.userId, plotId: plotIds[0] });
  });

  it("sin punto sigue andando y un solo valor se rechaza; el empleado no asigna", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const worker = await addMemberAndLogin(owner.token, "worker");
    const base = { farmId, assigneeId: worker.userId, title: "Revisar", dueDate: "2026-11-11" };
    expect((await call("POST", "/org/tasks", { token: owner.token, body: base })).status).toBe(201);
    expect((await call("POST", "/org/tasks", { token: owner.token, body: { ...base, lon: -55.9 } })).status).toBe(400);
    expect((await call("POST", "/org/tasks", { token: worker.token, body: { ...base, lon: -55.9, lat: -27.2 } })).status).toBe(403);
  });
});
