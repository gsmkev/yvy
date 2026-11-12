/** T-03: foto y ubicación obligatorias para cerrar ciertas tareas. */
import { describe, expect, it } from "vitest";
import { closeProblem, closeRequirements, newId } from "@yvy/shared";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";
import { push, rec } from "./records-helpers";

const attach = (recordId: string) => ({
  mutationId: newId(),
  kind: "attachments.upsert",
  row: { id: newId(), recordId, mime: "image/webp", width: 100, height: 100, bytes: 1000 },
});
const close = (taskId: string, recordId: string | null) => ({
  mutationId: newId(),
  kind: "tasks.status",
  row: { id: taskId, status: "done", completedAt: Date.now(), recordId },
});
const statuses = (r: { body: unknown }) =>
  (r.body as { results: { status: string; reason?: string; detail?: string }[] }).results;

async function setup(kind: string | null) {
  const owner = await createOrgWithOwner();
  const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
  const worker = await addMemberAndLogin(owner.token, "worker");
  await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
  const t = await call<{ id: string }>("POST", "/org/tasks", {
    token: owner.token,
    body: { farmId, plotId: plotIds[0], assigneeId: worker.userId, title: "Fumigar", kind, dueDate: "2030-01-01" },
  });
  return { farmId, plotId: plotIds[0]!, worker, taskId: t.body.id };
}

describe("T-03 · requisitos de cierre", () => {
  it("las reglas viven en shared", () => {
    expect(closeRequirements("application")).toEqual({ photo: true, location: true });
    expect(closeRequirements("rain")).toBeNull();
    expect(closeRequirements(null)).toBeNull();
    const req = { photo: true, location: true };
    expect(closeProblem(req, null, 0)).toBe("record");
    expect(closeProblem(req, { lon: 1, lat: 1 }, 0)).toBe("photo");
    expect(closeProblem(req, { lon: null, lat: null }, 1)).toBe("location");
    expect(closeProblem(req, { lon: 1, lat: 1 }, 1)).toBeNull();
  });

  it("rechaza cerrar sin registro, sin foto o sin ubicación", async () => {
    const { farmId, plotId, worker, taskId } = await setup("scouting");
    expect(statuses(await push(worker.token, [close(taskId, null)]))[0]).toMatchObject({ status: "rejected", reason: "close_requirements", detail: "record" });

    const noPhoto = rec(farmId, plotId, "rain", { mm: 1, readAt: Date.now() });
    (noPhoto.row as { lon: number | null }).lon = -55.9;
    (noPhoto.row as { lat: number | null }).lat = -27.2;
    const r1 = statuses(await push(worker.token, [noPhoto, close(taskId, noPhoto.row.id)]));
    expect(r1[1]).toMatchObject({ status: "rejected", detail: "photo" });

    const noLoc = rec(farmId, plotId, "rain", { mm: 1, readAt: Date.now() });
    const r2 = statuses(await push(worker.token, [noLoc, attach(noLoc.row.id), close(taskId, noLoc.row.id)]));
    expect(r2[2]).toMatchObject({ status: "rejected", detail: "location" });
    expect((await pullAll(worker.token, "tasks"))[0].status).toBe("open");
  });

  it("acepta el cierre con foto y ubicación, en el mismo lote de sync o en uno posterior", async () => {
    const { farmId, plotId, worker, taskId } = await setup("application");
    const r = rec(farmId, plotId, "rain", { mm: 1, readAt: Date.now() });
    (r.row as { lon: number | null }).lon = -55.9;
    (r.row as { lat: number | null }).lat = -27.2;
    const res = statuses(await push(worker.token, [r, attach(r.row.id), close(taskId, r.row.id)]));
    expect(res.map((x) => x.status)).toEqual(["applied", "applied", "applied"]);
    expect((await pullAll(worker.token, "tasks"))[0].status).toBe("done");
  });

  it("acepta el cierre en un push posterior al del registro", async () => {
    const { farmId, plotId, worker, taskId } = await setup("pest");
    const r = rec(farmId, plotId, "rain", { mm: 1, readAt: Date.now() });
    (r.row as { lon: number | null }).lon = -55.9;
    (r.row as { lat: number | null }).lat = -27.2;
    await push(worker.token, [r, attach(r.row.id)]);
    expect(statuses(await push(worker.token, [close(taskId, r.row.id)]))[0]!.status).toBe("applied");
  });

  it("las tareas sin tipo o de un tipo sin requisitos se cierran como siempre", async () => {
    const a = await setup(null);
    expect(statuses(await push(a.worker.token, [close(a.taskId, null)]))[0]!.status).toBe("applied");
    const b = await setup("rain");
    expect(statuses(await push(b.worker.token, [close(b.taskId, null)]))[0]!.status).toBe("applied");
  });
});
