import { describe, expect, it } from "vitest";
import { newId, parseTaskComments, isOverdue, LIMITS } from "@yvy/shared";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";

async function setup() {
  const owner = await createOrgWithOwner();
  const { farmId, plotIds } = await createFarmWithPlots(owner.token, 3);
  const worker = await addMemberAndLogin(owner.token, "worker", "Ramón");
  const other = await addMemberAndLogin(owner.token, "worker", "Otro");
  await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]] } });
  const task = (over: Record<string, unknown> = {}) =>
    call<{ id: string }>("POST", "/org/tasks", {
      token: owner.token,
      body: { farmId, assigneeId: worker.userId, title: "Medir lluvia", dueDate: "2026-11-20", ...over },
    });
  return { owner, worker, other, farmId, plotIds, task };
}

describe("tareas: prioridad, hora límite y comentarios (T-02)", () => {
  it("guarda prioridad y hora, y las rechaza si son inválidas", async () => {
    const { owner, worker, task } = await setup();
    expect((await task({ priority: "high", dueTime: "16:30" })).status).toBe(201);
    expect((await task()).status).toBe(201);
    expect((await task({ priority: "urgente" })).status).toBe(400);
    expect((await task({ dueTime: "25:00" })).status).toBe(400);
    const rows = await pullAll(worker.token, "tasks");
    expect(rows.find((r) => r.priority === "high")?.dueTime).toBe("16:30");
    const plain = rows.find((r) => r.priority === "normal");
    expect(plain?.dueTime).toBeNull();
    expect(plain?.comments).toBe("[]");
    // el dueño edita
    const id = rows.find((r) => r.priority === "high").id;
    expect(
      (await call("PATCH", `/org/tasks/${id}`, { token: owner.token, body: { priority: "low", dueTime: null } }))
        .status,
    ).toBe(200);
    const again = (await pullAll(worker.token, "tasks")).find((r) => r.id === id);
    expect(again).toMatchObject({ priority: "low", dueTime: null });
  });

  it("el empleado no edita prioridad ni hora", async () => {
    const { worker, task } = await setup();
    const t = await task();
    const r = await call("PATCH", `/org/tasks/${t.body.id}`, { token: worker.token, body: { priority: "high" } });
    expect(r.status).toBe(403);
  });

  it("comentarios: dueño y empleado asignado comentan; otro empleado no ve la tarea", async () => {
    const { owner, worker, other, task } = await setup();
    const t = await task();
    const url = `/org/tasks/${t.body.id}/comments`;
    const a = await call<{ name: string; text: string }>("POST", url, {
      token: owner.token,
      body: { text: "  Pasá por el pluviómetro  " },
    });
    expect(a.status).toBe(201);
    expect(a.body.text).toBe("Pasá por el pluviómetro");
    expect((await call("POST", url, { token: worker.token, body: { text: "Listo, 12 mm" } })).status).toBe(201);
    expect((await call("POST", url, { token: other.token, body: { text: "me meto" } })).status).toBe(404);
    expect((await call("POST", url, { token: owner.token, body: { text: "   " } })).status).toBe(400);
    expect(
      (await call("POST", url, { token: owner.token, body: { text: "x".repeat(LIMITS.tasks.maxCommentLength + 1) } }))
        .status,
    ).toBe(400);
    // Baja al celular por el sync, con el nombre del autor
    const [row] = await pullAll(worker.token, "tasks");
    const list = parseTaskComments(row.comments);
    expect(list.map((c) => c.text)).toEqual(["Pasá por el pluviómetro", "Listo, 12 mm"]);
    expect(list[1]!.userId).toBe(worker.userId);
    expect(list[0]!.name).toBe("Dueño");
    // El que no la ve no la recibe
    expect(await pullAll(other.token, "tasks")).toHaveLength(0);
  });

  it("comentarios: tope por tarea, otra organización y tarea inexistente", async () => {
    const { owner, task } = await setup();
    const t = await task();
    const url = `/org/tasks/${t.body.id}/comments`;
    for (let i = 0; i < LIMITS.tasks.maxComments; i++)
      expect((await call("POST", url, { token: owner.token, body: { text: `n${i}` } })).status).toBe(201);
    expect((await call("POST", url, { token: owner.token, body: { text: "uno más" } })).status).toBe(403);
    const stranger = await createOrgWithOwner("Otra");
    expect((await call("POST", url, { token: stranger.token, body: { text: "hola" } })).status).toBe(404);
    expect(
      (await call("POST", `/org/tasks/${newId()}/comments`, { token: owner.token, body: { text: "hola" } })).status,
    ).toBe(404);
  });

  it("al completar una tarea recurrente, la siguiente conserva prioridad y hora", async () => {
    const { worker, task } = await setup();
    const t = await task({ recurrence: "daily", priority: "high", dueTime: "08:00" });
    const push = await call("POST", "/sync/push", {
      token: worker.token,
      body: {
        deviceId: "dev",
        mutations: [
          {
            mutationId: newId(),
            kind: "tasks.status",
            row: { id: t.body.id, status: "done", completedAt: Date.now(), recordId: null },
          },
        ],
      },
    });
    expect(push.status).toBe(200);
    const rows = await pullAll(worker.token, "tasks");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.priority === "high" && r.dueTime === "08:00")).toBe(true);
  });

  it("isOverdue: hoy con hora ya pasada vence", () => {
    const base = { status: "open", dueDate: "2026-11-11" };
    expect(isOverdue({ ...base, dueTime: "09:00" }, "2026-11-11", "10:00")).toBe(true);
    expect(isOverdue({ ...base, dueTime: "18:00" }, "2026-11-11", "10:00")).toBe(false);
    expect(isOverdue({ ...base, dueTime: null }, "2026-11-11", "23:00")).toBe(false);
    expect(isOverdue({ ...base, dueDate: "2026-11-10" }, "2026-11-11", "00:01")).toBe(true);
    expect(isOverdue({ status: "done", dueDate: "2026-11-01" }, "2026-11-11", "00:01")).toBe(false);
  });
});
