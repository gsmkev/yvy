/** Push y pull del Worker (PRD §11). */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db, pullAll } from "./helpers";

const record = (farmId: string, plotId: string | null, over: Record<string, unknown> = {}) => ({
  mutationId: newId(),
  kind: "records.upsert",
  row: {
    id: newId(),
    farmId,
    plotId,
    poiId: null,
    kind: "scouting",
    data: { condition: "good", note: "todo bien" },
    schemaVersion: RECORD_SCHEMA_VERSION,
    lon: -55.89,
    lat: -27.21,
    gpsAccuracyM: 5,
    capturedAt: Date.now(),
    ...over,
  },
});

async function setup() {
  const owner = await createOrgWithOwner();
  const { farmId, plotIds } = await createFarmWithPlots(owner.token, 5);
  const worker = await addMemberAndLogin(owner.token, "worker");
  await call("PUT", `/org/members/${worker.userId}/plots`, {
    token: owner.token,
    body: { plotIds: plotIds.slice(0, 2) },
  });
  return { owner, worker, farmId, plotIds };
}

const push = (token: string, mutations: unknown[]) =>
  call("POST", "/sync/push", { token, body: { deviceId: "dev", mutations } });

describe("sync/push", () => {
  it("empleado: crea en su lote o sin lote; rechaza lote ajeno", async () => {
    const { worker, farmId, plotIds } = await setup();
    const r = await push(worker.token, [
      record(farmId, plotIds[0]!),
      record(farmId, null),
      record(farmId, plotIds[4]!),
    ]);
    expect(r.status).toBe(200);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "applied", "rejected"]);
    expect(r.body.results[2].reason).toBe("forbidden");
  });

  it("monitoreo por estaciones: el registro de plaga con estaciones se acepta y vuelve en el pull", async () => {
    const { worker, farmId, plotIds } = await setup();
    const stations = [
      { lon: -55.89, lat: -27.21, accuracyM: 6, counts: { chinche_verde: 3, roya: 2 } },
      { counts: { chinche_verde: 1, roya: 0 } },
    ];
    const ok = record(farmId, plotIds[0]!, {
      kind: "pest",
      data: { pest: "chinche", intensity: "high", perMeter: 2, crop: "soja", stations, averages: { chinche_verde: 2, roya: 1 } },
    });
    const bad = record(farmId, plotIds[0]!, { kind: "pest", data: { pest: "chinche", stations: [] } });
    const r = await push(worker.token, [ok, bad]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "rejected"]);
    const pulled = (await pullAll(worker.token, "records")).find((x: any) => x.id === ok.row.id);
    expect(JSON.parse(pulled.data).stations).toHaveLength(2);
  });

  it("idempotencia: el mismo mutationId dos veces no duplica", async () => {
    const { worker, farmId, plotIds } = await setup();
    const m = record(farmId, plotIds[0]!);
    expect((await push(worker.token, [m])).body.results[0].status).toBe("applied");
    expect((await push(worker.token, [m])).body.results[0].status).toBe("duplicate");
    const r = await push(worker.token, [m, m]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["duplicate", "duplicate"]);
    expect(await pullAll(worker.token, "records")).toHaveLength(1);
  });

  it("valida los datos según el tipo de registro", async () => {
    const { worker, farmId } = await setup();
    const r = await push(worker.token, [record(farmId, null, { kind: "rain", data: { mm: -3, readAt: 1 } })]);
    expect(r.body.results[0]).toMatchObject({ status: "rejected", reason: "invalid" });
    const bad = await push(worker.token, [record(farmId, null, { kind: "nope" })]);
    expect(bad.status).toBe(400);
  });

  it("40 mutaciones con fotos entran en un push (límites de D1)", async () => {
    const { worker, farmId, plotIds } = await setup();
    const muts: unknown[] = [];
    for (let i = 0; i < 20; i++) {
      const m = record(farmId, plotIds[i % 2]!);
      muts.push(m, {
        mutationId: newId(),
        kind: "attachments.upsert",
        row: { id: newId(), recordId: m.row.id, mime: "image/webp", width: 1280, height: 960, bytes: 120_000 },
      });
    }
    const r = await push(worker.token, muts);
    expect(r.status).toBe(200);
    expect(r.body.results.every((x: any) => x.status === "applied")).toBe(true);
    const atts = await pullAll(worker.token, "attachments");
    expect(atts).toHaveLength(20);
    expect(atts[0].storagePath).toMatch(/^organizations\/.+\/records\/.+\.webp$/);
    expect(atts[0].uploadStatus).toBe("pending");
  });

  it("máximo de fotos por registro", async () => {
    const { worker, farmId } = await setup();
    const m = record(farmId, null);
    const att = () => ({
      mutationId: newId(),
      kind: "attachments.upsert",
      row: { id: newId(), recordId: m.row.id, mime: "image/webp", width: null, height: null, bytes: null },
    });
    const r = await push(worker.token, [m, att(), att(), att(), att()]);
    expect(r.body.results.map((x: any) => x.reason ?? x.status)).toEqual([
      "applied",
      "applied",
      "applied",
      "applied",
      "too_many_attachments",
    ]);
  });

  it("edición: empleado solo los propios y dentro de 24 h; dueño todos", async () => {
    const { owner, worker, farmId, plotIds } = await setup();
    const own = record(farmId, plotIds[0]!);
    const ownerRec = record(farmId, plotIds[0]!);
    await push(worker.token, [own]);
    await push(owner.token, [ownerRec]);

    const edit = (m: any) => ({ ...m, mutationId: newId(), row: { ...m.row, data: { condition: "bad" } } });
    expect((await push(worker.token, [edit(ownerRec)])).body.results[0].reason).toBe("forbidden");
    expect((await push(worker.token, [edit(own)])).body.results[0].status).toBe("applied");

    // Pasaron 25 h
    await db()
      .update(s.records)
      .set({ createdAt: Date.now() - 25 * 3_600_000 })
      .where(eq(s.records.id, own.row.id));
    expect((await push(worker.token, [edit(own)])).body.results[0].reason).toBe("edit_window_expired");
    expect(
      (await push(worker.token, [{ mutationId: newId(), kind: "records.delete", row: { id: own.row.id } }])).body
        .results[0].reason,
    ).toBe("edit_window_expired");
    expect(
      (await push(owner.token, [{ mutationId: newId(), kind: "records.delete", row: { id: own.row.id } }])).body
        .results[0].status,
    ).toBe("applied");

    const rows = await pullAll(worker.token, "records");
    expect(rows.find((r) => r.id === own.row.id).deletedAt).not.toBeNull();
  });

  it("tareas: el empleado cambia el estado de las suyas; done gana sobre open", async () => {
    const { owner, worker, farmId } = await setup();
    const t = await call("POST", "/org/tasks", {
      token: owner.token,
      body: {
        farmId,
        assigneeId: worker.userId,
        title: "Medir lluvia",
        kind: "rain",
        dueDate: "2026-11-10",
        recurrence: "daily",
      },
    });
    expect(t.status).toBe(201);
    const status = (st: string) => ({
      mutationId: newId(),
      kind: "tasks.status",
      row: { id: t.body.id, status: st, completedAt: Date.now(), recordId: null },
    });
    expect((await push(worker.token, [status("done")])).body.results[0].status).toBe("applied");
    expect((await push(worker.token, [status("open")])).body.results[0].status).toBe("applied");
    const [task] = await pullAll(worker.token, "tasks");
    expect(task.status).toBe("done");
    expect(task.completedBy).toBe(worker.userId);
  });

  it("lista de verificación: el empleado tilda ítems de su tarea, no de las ajenas ni inexistentes; se repite sin tildar", async () => {
    const { owner, worker, farmId } = await setup();
    const other = await addMemberAndLogin(owner.token, "worker");
    const mk = (assigneeId: string, over: Record<string, unknown> = {}) =>
      call("POST", "/org/tasks", {
        token: owner.token,
        body: {
          farmId,
          assigneeId,
          title: "Revisar bebederos",
          dueDate: "2026-11-10",
          checklist: ["Bebedero 1", "Bebedero 2", "  ", "Bebedero 3"],
          ...over,
        },
      });
    const mine = await mk(worker.userId, { recurrence: "daily" });
    const theirs = await mk(other.userId);
    expect(mine.status).toBe(201);
    const check = (id: string, itemId: string, done = true) => ({
      mutationId: newId(),
      kind: "tasks.check",
      row: { id, itemId, done },
    });
    const r = await push(worker.token, [
      check(mine.body.id, "i1"),
      check(mine.body.id, "i3"),
      check(mine.body.id, "zzz"),
      check(theirs.body.id, "i1"),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "applied", "rejected", "rejected"]);
    expect(r.body.results[2].reason).toBe("invalid");
    expect(r.body.results[3].reason).toBe("forbidden");
    expect((await push(worker.token, [check(mine.body.id, "i3", false)])).body.results[0].status).toBe("applied");
    let [task] = (await pullAll(worker.token, "tasks")).filter((x: any) => x.id === mine.body.id);
    expect(JSON.parse(task.checklist).map((i: any) => [i.text, i.done])).toEqual([
      ["Bebedero 1", true],
      ["Bebedero 2", false],
      ["Bebedero 3", false],
    ]);
    // Al completarla nace la siguiente con la lista sin tildar.
    await push(worker.token, [
      { mutationId: newId(), kind: "tasks.status", row: { id: mine.body.id, status: "done", completedAt: Date.now(), recordId: null } },
    ]);
    const all = await pullAll(worker.token, "tasks");
    const next = all.find((x: any) => x.id !== mine.body.id);
    expect(JSON.parse(next.checklist).every((i: any) => !i.done)).toBe(true);
    [task] = all.filter((x: any) => x.id === mine.body.id);
    expect(JSON.parse(task.checklist)[0].done).toBe(true);
  });
});

describe("sync/pull", () => {
  it("pagina por (version, id) sin perder ni repetir filas", async () => {
    const { owner, farmId } = await setup();
    const muts = Array.from({ length: 40 }, () => record(farmId, null));
    for (let i = 0; i < 6; i++)
      await push(
        owner.token,
        muts.map((m) => ({ ...m, mutationId: newId(), row: { ...m.row, id: newId() } })),
      );
    const rows = await pullAll(owner.token, "records");
    expect(rows).toHaveLength(240);
    expect(new Set(rows.map((r) => r.id)).size).toBe(240);
  });

  it("cambio de asignación sube assignmentsVersion", async () => {
    const { owner, worker, plotIds } = await setup();
    const before = (await call("GET", "/sync/state", { token: worker.token })).body.assignmentsVersion;
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[3]] } });
    const after = (await call("GET", "/sync/state", { token: worker.token })).body.assignmentsVersion;
    expect(after).toBe(before + 1);
    expect((await pullAll(worker.token, "plots")).map((p) => p.id)).toEqual([plotIds[3]]);
    // reasignar lo mismo no cambia nada
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[3]] } });
    expect((await call("GET", "/sync/state", { token: worker.token })).body.assignmentsVersion).toBe(after);
  });

  it("registros de más de 30 días no bajan", async () => {
    const { owner, farmId } = await setup();
    await push(owner.token, [record(farmId, null, { capturedAt: Date.now() - 31 * 86_400_000 }), record(farmId, null)]);
    expect(await pullAll(owner.token, "records")).toHaveLength(1);
    expect(env.DB).toBeTruthy();
  });
});
