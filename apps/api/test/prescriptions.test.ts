/** Receta → órdenes de trabajo (ADR 0004, A-11). */
import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";

async function setup() {
  const owner = await createOrgWithOwner();
  const { farmId, plotIds } = await createFarmWithPlots(owner.token, 3);
  const worker = await addMemberAndLogin(owner.token, "worker");
  const agro = await addMemberAndLogin(owner.token, "agronomist", "Ing. Agrónoma");
  await call("PUT", `/org/members/${worker.userId}/plots`, {
    token: owner.token,
    body: { plotIds: [plotIds[0]!, plotIds[1]!] },
  });
  return { owner, worker, agro, farmId, plotIds };
}

const rx = { products: [{ productId: newId(), name: "Glifosato 48", dose: 2, unit: "l_ha" }], volumeLHa: 80 };
const body = (farmId: string, plotIds: string[], assigneeId: string, over: Record<string, unknown> = {}) => ({
  farmId,
  plotIds,
  assigneeId,
  dueDate: "2026-11-20",
  prescription: rx,
  ...over,
});

describe("recetas", () => {
  it("el agrónomo crea una tarea por lote con la receta; llegan al celular del empleado", async () => {
    const { agro, worker, farmId, plotIds } = await setup();
    const r = await call<{ ids: string[] }>("POST", "/org/prescriptions", {
      token: agro.token,
      body: body(farmId, [plotIds[0]!, plotIds[1]!], worker.userId),
    });
    expect(r.status).toBe(201);
    expect(r.body.ids).toHaveLength(2);
    const tasks = await pullAll(worker.token, "tasks");
    expect(tasks).toHaveLength(2);
    for (const t of tasks) {
      expect(t).toMatchObject({ kind: "application", assigneeId: worker.userId, status: "open", dueDate: "2026-11-20" });
      expect(JSON.parse(t.prescription)).toMatchObject({ volumeLHa: 80, products: [{ name: "Glifosato 48", dose: 2 }] });
      expect(t.title).toContain("Glifosato 48 2 L/ha");
    }
    expect(tasks.map((t) => t.plotId).sort()).toEqual([plotIds[0], plotIds[1]].sort());
  });

  it("el empleado no puede crear recetas", async () => {
    const { worker, farmId, plotIds } = await setup();
    const r = await call("POST", "/org/prescriptions", {
      token: worker.token,
      body: body(farmId, [plotIds[0]!], worker.userId),
    });
    expect(r.status).toBe(403);
  });

  it("valida receta, lotes y destinatario", async () => {
    const { agro, owner, worker, farmId, plotIds } = await setup();
    const post = (b: unknown, token = agro.token) => call("POST", "/org/prescriptions", { token, body: b });
    expect((await post(body(farmId, [plotIds[0]!], worker.userId, { prescription: { products: [] } }))).status).toBe(400);
    expect(
      (
        await post(
          body(farmId, [plotIds[0]!], worker.userId, { prescription: { products: [{ ...rx.products[0], dose: 0 }] } }),
        )
      ).status,
    ).toBe(400);
    expect((await post(body(farmId, [], worker.userId))).status).toBe(400);
    expect((await post(body(farmId, [newId()], worker.userId))).status).toBe(404);
    expect((await post(body(farmId, [plotIds[0]!], newId()))).status).toBe(404);
    // lote de otra organización
    const other = await createOrgWithOwner("Otra");
    const foreign = await createFarmWithPlots(other.token, 1);
    expect((await post(body(farmId, foreign.plotIds, worker.userId), owner.token)).status).toBe(404);
  });

  it("al completar la tarea desde el celular, el registro de aplicación queda vinculado", async () => {
    const { agro, worker, farmId, plotIds } = await setup();
    const r = await call<{ ids: string[] }>("POST", "/org/prescriptions", {
      token: agro.token,
      body: body(farmId, [plotIds[0]!], worker.userId),
    });
    const taskId = r.body.ids[0]!;
    const recordId = newId();
    const push = await call("POST", "/sync/push", {
      token: worker.token,
      body: {
        deviceId: "d",
        mutations: [
          {
            mutationId: newId(),
            kind: "records.upsert",
            row: {
              id: recordId,
              farmId,
              plotId: plotIds[0],
              poiId: null,
              kind: "application",
              data: { ...rx, prescriptionTaskId: taskId, areaHa: 12 },
              schemaVersion: 1,
              lon: null,
              lat: null,
              gpsAccuracyM: null,
              capturedAt: Date.now(),
            },
          },
          {
            mutationId: newId(),
            kind: "tasks.status",
            row: { id: taskId, status: "done", completedAt: Date.now(), recordId },
          },
        ],
      },
    });
    expect(push.body.results.map((x: { status: string }) => x.status)).toEqual(["applied", "applied"]);
    const [t] = (await pullAll(worker.token, "tasks")).filter((x) => x.id === taskId);
    expect(t).toMatchObject({ status: "done", recordId });
  });
});
