import { describe, expect, it } from "vitest";
import { addDays, localDate, newId, nextOccurrenceId } from "@yvy/shared";
import { LocalDb } from "../src/db/store";
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
