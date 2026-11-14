/** Pruebas obligatorias del motor (PRD §11). */
import { describe, expect, it } from "vitest";
import { newId, RECORD_SCHEMA_VERSION, type Mutation } from "@yvy/shared";
import { CpuLimitError, SyncEngine, syncStatusLabel, type Transport } from "../src";
import { FakeServer } from "./fake-server";
import { MemStore } from "./mem-store";

const farmId = newId();
const DAY = 86_400_000;

const recordUpsert = (capturedAt = Date.now()): Mutation => ({
  mutationId: newId(),
  kind: "records.upsert",
  row: {
    id: newId(),
    farmId,
    plotId: null,
    poiId: null,
    kind: "rain",
    data: { mm: 12, readAt: capturedAt },
    schemaVersion: RECORD_SCHEMA_VERSION,
    lon: -55.9,
    lat: -27.3,
    gpsAccuracyM: 8,
    capturedAt,
  },
});

const setup = (transport?: (s: FakeServer) => Transport) => {
  const server = new FakeServer();
  const store = new MemStore();
  const engine = new SyncEngine({
    store,
    transport: transport ? transport(server) : server.transport(),
    deviceId: "dev-1",
  });
  return { server, store, engine };
};

describe("SyncEngine · PRD §11", () => {
  it("corte de red a mitad del push: no se pierde nada y el reintento completa", async () => {
    let calls = 0;
    const { server, store, engine } = setup((s) => ({
      ...s.transport(),
      push: async (d, ms) => {
        if (++calls === 2) throw new TypeError("Network request failed");
        return s.transport().push(d, ms);
      },
    }));
    for (let i = 0; i < 100; i++) store.enqueue(recordUpsert());

    await expect(engine.sync()).rejects.toThrow("Network request failed");
    expect(store.outbox).toHaveLength(60); // primer lote de 40 aplicado, el resto sigue en el outbox

    await engine.sync();
    expect(store.outbox).toHaveLength(0);
    expect(server.table("records").size).toBe(100);
    expect(store.live("records")).toHaveLength(100);
  });

  it("respuesta perdida y reintento: el servidor no duplica", async () => {
    let lose = true;
    const { server, store, engine } = setup((s) => ({
      ...s.transport(),
      push: async (d, ms) => {
        const res = await s.transport().push(d, ms);
        if (lose) {
          lose = false;
          throw new TypeError("socket hang up"); // el servidor aplicó, pero la respuesta no llegó
        }
        return res;
      },
    }));
    for (let i = 0; i < 15; i++) store.enqueue(recordUpsert());

    await expect(engine.sync()).rejects.toThrow();
    expect(store.outbox).toHaveLength(15);
    const r = await engine.sync();
    expect(r.pushed).toBe(15);
    expect(server.table("records").size).toBe(15);
    expect(store.outbox).toHaveLength(0);
  });

  it("mismo mutationId dos veces: se aplica una sola vez", async () => {
    const { server, store, engine } = setup();
    const m = recordUpsert();
    store.enqueue(m);
    store.enqueue(structuredClone(m));
    await engine.sync();
    expect(server.seen.size).toBe(1);
    expect(server.table("records").size).toBe(1);
    expect(store.outbox).toHaveLength(0);
  });

  it("1.000 registros pendientes: suben todos en lotes de ≤ 40", async () => {
    const { server, store, engine } = setup();
    for (let i = 0; i < 1000; i++) store.enqueue(recordUpsert());
    const r = await engine.sync();
    expect(r.pushed).toBe(1000);
    expect(Math.max(...server.pushCalls)).toBe(40);
    expect(server.pushCalls).toHaveLength(25);
    expect(store.live("records")).toHaveLength(1000);
  });

  it("cambio de asignación: rehace las tablas del empleado sin perder lo pendiente", async () => {
    const { server, store, engine } = setup();
    const plotA = newId();
    const plotB = newId();
    server.write("plots", { id: plotA, name: "Lote A" });
    await engine.sync();
    expect(store.live("plots").map((p) => p.id)).toEqual([plotA]);

    // El admin le saca el lote A y le asigna el B. El servidor ya no devuelve A.
    server.tables.get("plots")!.clear();
    server.write("plots", { id: plotB, name: "Lote B" });
    server.assignmentsVersion++;
    const pending = recordUpsert();
    store.enqueue(pending);

    const r = await engine.sync();
    expect(r.reset).toBe(true);
    expect(store.live("plots").map((p) => p.id)).toEqual([plotB]);
    expect(server.seen.has(pending.mutationId)).toBe(true);
  });

  it("reloj del celular atrasado 3 días: otro dispositivo igual recibe los registros", async () => {
    const server = new FakeServer();
    const a = new MemStore();
    const b = new MemStore();
    const ea = new SyncEngine({
      store: a,
      transport: server.transport(),
      deviceId: "a",
      now: () => Date.now() - 3 * DAY,
    });
    const eb = new SyncEngine({ store: b, transport: server.transport(), deviceId: "b" });

    await eb.sync(); // B ya tiene cursor
    a.enqueue(recordUpsert(Date.now() - 3 * DAY));
    await ea.sync();
    await eb.sync();
    expect(b.live("records")).toHaveLength(1);
  });

  it("límite de CPU: divide el lote y sigue", async () => {
    const { store, engine } = setup((s) => ({
      ...s.transport(),
      push: async (d, ms) => {
        if (ms.length > 10) throw new CpuLimitError();
        return s.transport().push(d, ms);
      },
    }));
    for (let i = 0; i < 30; i++) store.enqueue(recordUpsert());
    const r = await engine.sync();
    expect(r.pushed).toBe(30);
    expect(engine.currentBatchSize).toBe(10);
  });

  it("rechazadas quedan marcadas y no se reintentan", async () => {
    let calls = 0;
    const { store, engine } = setup((s) => ({
      ...s.transport(),
      push: async (_d, ms) => {
        calls++;
        return {
          results: ms.map((m) => ({
            mutationId: m.mutationId,
            status: "rejected" as const,
            reason: "forbidden" as const,
          })),
        };
      },
    }));
    store.enqueue(recordUpsert());
    await engine.sync();
    await engine.sync();
    expect(calls).toBe(1);
    expect([...store.rejected.values()]).toEqual(["forbidden"]);
  });

  it("pullTables vacío: solo manda (sin consultar el estado ni bajar tablas)", async () => {
    const calls: string[] = [];
    const server = new FakeServer();
    const base = server.transport();
    const store = new MemStore();
    const engine = new SyncEngine({
      store,
      deviceId: "web",
      pullTables: [],
      transport: {
        state: async () => (calls.push("state"), base.state()),
        push: async (d, ms) => (calls.push("push"), base.push(d, ms)),
        pull: async (t, c) => (calls.push(`pull:${t}`), base.pull(t, c)),
      },
    });
    store.enqueue(recordUpsert());
    const r = await engine.sync();
    expect(r.pushed).toBe(1);
    expect(calls).toEqual(["push"]);
    expect(server.table("records").size).toBe(1);
    expect(store.assignmentsVersion).toBeNull();
    expect(r.pulled).toEqual({});
  });

  it("pullTables parcial: baja solo esas tablas y rehace solo las suyas si cambian las asignaciones", async () => {
    const server = new FakeServer();
    const store = new MemStore();
    const pulled: string[] = [];
    const base = server.transport();
    const engine = new SyncEngine({
      store,
      deviceId: "web",
      pullTables: ["tasks", "records"],
      transport: { ...base, pull: async (t, c) => (pulled.push(t), base.pull(t, c)) },
    });
    store.assignmentsVersion = 1;
    server.assignmentsVersion = 2;
    await engine.sync();
    expect(pulled).toEqual(["tasks", "records"]);
    expect(store.resets).toEqual([["records"]]); // de las tablas con asignaciones, solo las que este cliente baja
  });

  it("ciclos concurrentes comparten la misma ejecución", async () => {
    const { store, engine } = setup();
    store.enqueue(recordUpsert());
    const [r1, r2] = await Promise.all([engine.sync(), engine.sync()]);
    expect(r1).toBe(r2);
  });

  it("indicador de estado (RF-43)", () => {
    const fmt = () => "11:52";
    expect(syncStatusLabel({ online: false, phase: "idle", pending: 3, lastSyncAt: null }, fmt)).toEqual({
      key: "offline",
      vars: { count: 3 },
    });
    expect(syncStatusLabel({ online: true, phase: "syncing", pending: 3, lastSyncAt: null }, fmt).key).toBe("syncing");
    expect(syncStatusLabel({ online: true, phase: "idle", pending: 0, lastSyncAt: 1 }, fmt)).toEqual({
      key: "synced",
      vars: { time: "11:52" },
    });
  });
});
