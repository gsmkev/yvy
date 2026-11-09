import { describe, expect, it } from "vitest";
import { localDate, newId, nextOccurrenceId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";

const rec = (
  farmId: string,
  plotId: string | null,
  kind = "rain",
  data: unknown = { mm: 10, readAt: 1 },
  capturedAt = Date.now(),
) => ({
  mutationId: newId(),
  kind: "records.upsert",
  row: {
    id: newId(),
    farmId,
    plotId,
    poiId: null,
    kind,
    data,
    schemaVersion: RECORD_SCHEMA_VERSION,
    lon: null,
    lat: null,
    gpsAccuracyM: null,
    capturedAt,
  },
});

async function setup() {
  const owner = await createOrgWithOwner();
  const { farmId, plotIds } = await createFarmWithPlots(owner.token, 3);
  const worker = await addMemberAndLogin(owner.token, "worker");
  await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]] } });
  return { owner, worker, farmId, plotIds };
}

describe("Fase 3 · tareas recurrentes", () => {
  it("completar una diaria crea la siguiente con el id que calcula el celular", async () => {
    const { owner, worker, farmId } = await setup();
    const today = localDate(Date.now());
    const t = await call("POST", "/org/tasks", {
      token: owner.token,
      body: {
        farmId,
        assigneeId: worker.userId,
        title: "Medir lluvia",
        kind: "rain",
        dueDate: today,
        recurrence: "daily",
      },
    });
    const done = {
      mutationId: newId(),
      kind: "tasks.status",
      row: { id: t.body.id, status: "done", completedAt: Date.now(), recordId: null },
    };
    await call("POST", "/sync/push", { token: worker.token, body: { deviceId: "d", mutations: [done] } });
    // reintento con otra mutación: no crea otra
    await call("POST", "/sync/push", {
      token: worker.token,
      body: { deviceId: "d", mutations: [{ ...done, mutationId: newId() }] },
    });
    const tasks = await pullAll(worker.token, "tasks");
    expect(tasks).toHaveLength(2);
    const next = tasks.find((x) => x.id === nextOccurrenceId(t.body.id));
    expect(next).toMatchObject({ status: "open", title: "Medir lluvia", recurrence: "daily" });
    expect(next.dueDate > today).toBe(true);
  });
});

describe("web", () => {
  it("lista de registros con filtros y paginado", async () => {
    const { owner, worker, farmId, plotIds } = await setup();
    const muts = [
      ...Array.from({ length: 5 }, (_, i) =>
        rec(farmId, plotIds[0]!, "rain", { mm: i, readAt: 1 }, Date.now() - i * 1000),
      ),
      rec(farmId, plotIds[1]!, "note", { text: "hola" }),
    ];
    await call("POST", "/sync/push", { token: owner.token, body: { deviceId: "w", mutations: muts } });

    const all = await call("GET", `/org/records?farmId=${farmId}`, { token: owner.token });
    expect(all.body.rows).toHaveLength(6);
    expect((await call("GET", `/org/records?kind=note`, { token: owner.token })).body.rows).toHaveLength(1);
    const p1 = await call("GET", `/org/records?limit=4`, { token: owner.token });
    expect(p1.body.rows).toHaveLength(4);
    const c = p1.body.nextCursor;
    const p2 = await call("GET", `/org/records?limit=4&cursorAt=${c.capturedAt}&cursorId=${c.id}`, {
      token: owner.token,
    });
    expect(p2.body.rows).toHaveLength(2);
    expect(p2.body.nextCursor).toBeNull();
    // el empleado solo ve los de su lote
    expect((await call("GET", `/org/records`, { token: worker.token })).body.rows).toHaveLength(5);
  });

  it("inicio multi estancia con resumen", async () => {
    const { owner, farmId } = await setup();
    await call("POST", "/sync/push", { token: owner.token, body: { deviceId: "w", mutations: [rec(farmId, null)] } });
    const r = await call("GET", "/org/farms", { token: owner.token });
    expect(r.body[0]).toMatchObject({ id: farmId, plots: 3, workers: 1, activeAlerts: 0 });
    expect(r.body[0].lastRecordAt).toBeGreaterThan(0);
    const d = await call("GET", `/org/farms/${farmId}`, { token: owner.token });
    expect(d.body.plots).toHaveLength(3);
    expect(d.body.assignments).toHaveLength(1);
  });

  it("editar y borrar lote; el cambio baja por sync", async () => {
    const { owner, worker, plotIds } = await setup();
    expect(
      (
        await call("PATCH", `/org/plots/${plotIds[0]}`, {
          token: owner.token,
          body: { name: "Lote Norte", crop: "maiz" },
        })
      ).status,
    ).toBe(200);
    expect((await call("PATCH", `/org/plots/${plotIds[0]}`, { token: worker.token, body: { name: "x" } })).status).toBe(
      403,
    );
    const [p] = await pullAll(worker.token, "plots");
    expect(p).toMatchObject({ name: "Lote Norte", crop: "maiz" });
    await call("DELETE", `/org/plots/${plotIds[1]}`, { token: owner.token });
    expect((await call("GET", "/org/farms", { token: owner.token })).body[0].plots).toBe(2);
  });

  it("baja de empleado cierra su sesión de refresco", async () => {
    const { owner, worker } = await setup();
    const link = await call("POST", "/auth/link", { token: owner.token, body: { userId: worker.userId } });
    const s1 = await call("POST", "/auth/link/redeem", { body: { code: link.body.code, deviceId: "x" } });
    expect((await call("DELETE", `/org/members/${worker.userId}`, { token: owner.token })).status).toBe(200);
    expect((await call("POST", "/auth/refresh", { body: { refreshToken: s1.body.refreshToken } })).status).toBe(401);
    expect((await call("DELETE", `/org/members/${owner.userId}`, { token: owner.token })).status).toBe(403);
  });

  it("registro de dispositivo y /me", async () => {
    const { worker } = await setup();
    expect(
      (
        await call("POST", "/devices", {
          token: worker.token,
          body: { id: "moto-e", platform: "android", pushToken: "ExponentPushToken[x]" },
        })
      ).status,
    ).toBe(200);
    const me = await call("GET", "/me", { token: worker.token });
    expect(me.body.role).toBe("worker");
  });
});
