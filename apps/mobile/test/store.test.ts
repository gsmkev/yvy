import { describe, expect, it } from "vitest";
import { addDays, localDate, newId, nextOccurrenceId } from "@yvy/shared";
import { LocalDb } from "../src/db/store";
import { planReminders } from "../src/lib/reminders-plan";
import { nodeSql } from "./node-sql";

const ORG = newId();
const USER = newId();
const FARM = newId();
const PLOT = newId();

function setup(now = () => Date.now()) {
  const db = new LocalDb(nodeSql(), now);
  db.migrate();
  db.migrate(); // idempotente
  return db;
}

const serverPlot = (version: number, name = "Lote 1") => ({
  id: PLOT,
  organizationId: ORG,
  farmId: FARM,
  name,
  kind: "crop",
  geometry: "{}",
  minLon: 0,
  minLat: 0,
  maxLon: 1,
  maxLat: 1,
  areaHa: 10,
  crop: "soja",
  season: null,
  sowingDate: null,
  pastureType: null,
  color: null,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
  version,
});

const rec = {
  farmId: FARM,
  plotId: PLOT,
  poiId: null,
  kind: "rain" as const,
  data: { mm: 12, readAt: 1 },
  lon: -55.9,
  lat: -27.2,
  gpsAccuracyM: 5,
  capturedAt: Date.now(),
};
const photo = { photoUri: "file:///p.webp", thumbUri: "file:///t.webp", width: 1280, height: 960, bytes: 120_000 };

describe("LocalDb", () => {
  it("miniatura del Historial: la primera foto local de cada registro", () => {
    const db = setup();
    const withPhotos = db.saveRecord(USER, ORG, rec, [{ ...photo, thumbUri: "file:///a_t.webp" }, { ...photo, thumbUri: "file:///b_t.webp" }]);
    const without = db.saveRecord(USER, ORG, rec);
    const thumbs = db.firstThumbByRecord();
    expect(thumbs.get(withPhotos)).toBe("file:///a_t.webp");
    expect(thumbs.has(without)).toBe(false);
  });

  it("cola de envío: registro con el peso de sus fotos, y fotos sueltas ya conocidas por el servidor", async () => {
    const db = setup();
    const id = db.saveRecord(USER, ORG, rec, [photo, photo]);
    let items = db.outboxItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ what: "record", recordKind: "rain", plotId: PLOT, photos: 2, photoBytes: 240_000 });
    // El servidor recibió las mutaciones: quedan las fotos por subir, ahora como ítem propio.
    await db.removeMutations((await db.pendingMutations(40)).map((m) => m.mutationId));
    items = db.outboxItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ what: "photos", recordKind: "rain", photos: 2, photoBytes: 240_000 });
    expect(id).toBeTruthy();
  });

  it("punto de interés: fila local y mutación pois.upsert en la misma transacción", async () => {
    const db = setup();
    const id = db.savePoi(ORG, { farmId: FARM, kind: "gate", name: "  Tranquera norte ", lon: -55.9, lat: -27.2 });
    expect(db.pois(FARM)).toMatchObject([{ id, kind: "gate", name: "Tranquera norte" }]);
    const muts = await db.pendingMutations(10);
    expect(muts).toHaveLength(1);
    expect(muts[0]).toMatchObject({ kind: "pois.upsert", row: { id, name: "Tranquera norte", kind: "gate" } });
    expect(db.outboxItems()[0]).toMatchObject({ what: "poi" });
  });

  it("varios lotes: un registro por lote en una transacción, mismo capturedAt, fotos en el primero", async () => {
    const db = setup();
    const plotB = newId();
    const ids = db.saveRecords(USER, ORG, [rec, { ...rec, plotId: plotB }], [photo]);
    expect(ids).toHaveLength(2);
    const rows = db.records();
    expect(rows.map((r) => r.capturedAt)).toEqual([rec.capturedAt, rec.capturedAt]);
    expect(new Set(rows.map((r) => r.plotId))).toEqual(new Set([PLOT, plotB]));
    expect(rows.find((r) => r.id === ids[0])!.photos).toBe(1);
    expect(rows.find((r) => r.id === ids[1])!.photos).toBe(0);
    expect((await db.pendingMutations(40)).map((m) => m.kind)).toEqual(["records.upsert", "attachments.upsert", "records.upsert"]);
  });

  it("recordatorios: un aviso por día a las 7:00 con las tareas abiertas; sin tareas, sin aviso", async () => {
    const now = new Date(2026, 5, 10, 8, 0, 0).getTime(); // 8:00: el de hoy ya pasó
    const db = setup(() => now);
    const task = (title: string, dueDate: string, status = "open") => ({
      id: newId(), organizationId: ORG, farmId: FARM, plotId: null, assigneeId: USER, title, kind: null, dueDate,
      recurrence: "none", status, completedAt: null, completedBy: null, recordId: null, createdBy: USER,
      createdAt: 1, updatedAt: 1, deletedAt: null, version: 1,
    });
    expect(planReminders(db, USER, now)).toEqual([]);
    await db.applyPull("tasks", [task("Medir lluvia", localDate(now)), task("Hecha", localDate(now), "done"), task("Revisar aguada", localDate(now + 86_400_000))], null);
    const plan = planReminders(db, USER, now);
    // Mañana 7:00 y pasado mañana 7:00 (la tarea de hoy sigue abierta, así que cuenta en ambos días)
    expect(plan.map((p) => [p.at.getHours(), p.at.getDate(), p.count])).toEqual([
      [7, 11, 2],
      [7, 12, 2],
    ]);
    expect(plan[0]!.titles).toContain("Revisar aguada");
  });

  it("ficha del lote: último vigor y tareas abiertas", async () => {
    const db = setup();
    expect(db.lastVigor(PLOT)).toBeNull();
    expect(db.openTasksOfPlot(PLOT)).toBe(0);
    const stat = (acquiredAt: number, mean: number) => ({
      id: newId(), organizationId: ORG, plotId: PLOT, sceneId: newId(), acquiredAt, idx: "ndvi", mean, p10: 0.2, p90: 0.8,
      validPct: 90, createdAt: 1, updatedAt: 1, deletedAt: null, version: 1,
    });
    await db.applyPull("plot_index_stats", [stat(1000, 0.4), stat(3000, 0.72), stat(2000, 0.5)], null);
    expect(db.lastVigor(PLOT)).toEqual({ mean: 0.72, acquiredAt: 3000 });
  });

  it("guardar registro con fotos: fila local + mutaciones en orden, pendiente", async () => {
    const db = setup();
    const id = db.saveRecord(USER, ORG, rec, [photo, photo]);
    const muts = await db.pendingMutations(40);
    expect(muts.map((m) => m.kind)).toEqual(["records.upsert", "attachments.upsert", "attachments.upsert"]);
    expect(db.pendingCount()).toBe(3);
    const [r] = db.records();
    expect(r).toMatchObject({ id, kind: "rain", pending: true, photos: 2 });
    expect(JSON.parse(r!.data)).toEqual({ mm: 12, readAt: 1 });
    // las fotos no se suben hasta que el servidor conozca el adjunto
    expect(db.pendingUploads()).toHaveLength(0);
    await db.removeMutations(muts.map((m) => m.mutationId));
    expect(db.pendingUploads()).toHaveLength(2);
    expect(db.records()[0]!.pending).toBe(false);
  });

  it("más fotos que el límite: no guarda nada", () => {
    const db = setup();
    expect(() => db.saveRecord(USER, ORG, rec, [photo, photo, photo, photo])).toThrow();
    expect(db.records()).toHaveLength(0);
    expect(db.pendingCount()).toBe(0);
  });

  it("el pull no pisa filas con cambios pendientes", async () => {
    const db = setup();
    const id = db.saveRecord(USER, ORG, rec);
    const server = { ...db.records()[0]!, data: JSON.stringify({ mm: 99, readAt: 1 }), version: 5 };
    await db.applyPull("records", [server], { version: 5, id });
    expect(JSON.parse(db.records()[0]!.data).mm).toBe(12);
    expect(await db.getCursor("records")).toEqual({ version: 5, id });
    await db.removeMutations((await db.pendingMutations(10)).map((m) => m.mutationId));
    await db.applyPull("records", [server], { version: 5, id });
    expect(JSON.parse(db.records()[0]!.data).mm).toBe(99);
  });

  it("reset por asignaciones conserva lo pendiente y borra cursores", async () => {
    const db = setup();
    await db.applyPull("plots", [serverPlot(3)], { version: 3, id: PLOT });
    db.saveRecord(USER, ORG, rec);
    await db.applyPull("records", [{ ...db.records()[0]!, id: newId(), version: 4 }], { version: 4, id: "x" });
    expect(db.records()).toHaveLength(2);
    await db.resetTables(["plots", "records"]);
    expect(db.plots()).toHaveLength(0);
    expect(db.records()).toHaveLength(1); // el pendiente queda
    expect(await db.getCursor("records")).toBeNull();
  });

  it("completar tarea diaria crea la siguiente localmente con el id del servidor", async () => {
    const now = Date.now();
    const db = setup(() => now);
    const today = localDate(now);
    const taskId = newId();
    await db.applyPull(
      "tasks",
      [
        {
          id: taskId,
          organizationId: ORG,
          farmId: FARM,
          plotId: null,
          assigneeId: USER,
          title: "Medir lluvia",
          kind: "rain",
          dueDate: today,
          recurrence: "daily",
          status: "open",
          completedAt: null,
          completedBy: null,
          recordId: null,
          createdBy: USER,
          createdAt: 1,
          updatedAt: 1,
          deletedAt: null,
          version: 1,
        },
      ],
      { version: 1, id: taskId },
    );
    expect(db.tasksToday(USER, today).map((t) => t.status)).toEqual(["open"]);
    const recordId = db.saveRecord(USER, ORG, rec);
    db.completeTask(taskId, recordId);
    expect(db.tasksToday(USER, today).map((t) => t.status)).toEqual(["done"]);
    const tomorrow = db.tasksToday(USER, addDays(today, 1));
    expect(tomorrow.map((t) => [t.id, t.status])).toEqual([[nextOccurrenceId(taskId), "open"]]);
    const kinds = (await db.pendingMutations(10)).map((m) => m.kind);
    expect(kinds).toEqual(["records.upsert", "tasks.status"]);
  });

  it("rechazadas: no se reintentan y se pueden descartar", async () => {
    const db = setup();
    db.saveRecord(USER, ORG, rec);
    const [m] = await db.pendingMutations(10);
    await db.markRejected([{ mutationId: m!.mutationId, reason: "forbidden" }]);
    expect(await db.pendingMutations(10)).toHaveLength(0);
    expect(db.records()[0]!.rejected).toBe("forbidden");
    db.dismissRejected(m!.mutationId);
    expect(db.rejected()).toHaveLength(0);
  });
});
