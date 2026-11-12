import { describe, expect, it } from "vitest";
import { newId, parseRecordData } from "@yvy/shared";
import { KINDS_FOR, stepsFor } from "../src/lib/annotate";
import { LocalDb } from "../src/db/store";
import { nodeSql } from "./node-sql";

const ORG = newId();
const setup = () => {
  const db = new LocalDb(nodeSql(), () => Date.now());
  db.migrate();
  return db;
};

describe("tratamiento sanitario con producto del catálogo (E-13)", () => {
  it("con productos veterinarios en el catálogo pregunta cuál y cuánto; el nombre a mano se salta", () => {
    const keys = (a: Record<string, unknown>, vet: boolean) => stepsFor("health", a, { waterPois: 0, vetProducts: vet }).map((s) => s.key);
    // "Otro producto" deja productId sin valor: sigue el nombre a mano
    expect(keys({}, true)).toEqual(["reason", "productId", "product", "dose", "counts", "tag", "note"]);
    const id = newId();
    expect(keys({ productId: id }, true)).toEqual(["reason", "productId", "quantity", "dose", "counts", "tag", "note"]);
    // sin catálogo veterinario, el producto se escribe a mano como siempre
    expect(keys({}, false)).toEqual(["reason", "product", "dose", "counts", "tag", "note"]);
  });

  it("el registro con productId y cantidad es válido y el esquema conserva ambos", () => {
    const id = newId();
    const r = parseRecordData("health", { reason: "aftosa", product: "Aftosa", productId: id, quantity: 2.5, counts: { vaca: 10 } });
    expect(r.success && r.data).toMatchObject({ productId: id, quantity: 2.5 });
    expect(parseRecordData("health", { reason: "aftosa", product: "x", quantity: -1, counts: { vaca: 1 } }).success).toBe(false);
  });
});

describe("máquinas en el celular (E-03)", () => {
  it("bajan con el pull de la tabla machines", async () => {
    const db = setup();
    const row = {
      id: newId(),
      organizationId: ORG,
      farmId: null,
      name: "John Deere 6130",
      type: "tractor",
      brand: null,
      model: null,
      year: 2018,
      meterKind: "hours",
      meterValue: 4200,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      version: 1,
    };
    await db.applyPull("machines", [row], { version: 1, id: row.id });
    expect(db.machines().map((m) => [m.name, m.meterValue])).toEqual([["John Deere 6130", 4200]]);
  });
});

describe("carga de combustible en el celular (E-16)", () => {
  it("con máquinas en el catálogo se elige una; sin catálogo se escribe el nombre", () => {
    const keys = (a: Record<string, unknown>, machines: boolean) =>
      stepsFor("fuel_load", a, { waterPois: 0, machines }).map((s) => s.key);
    expect(keys({}, true)).toEqual(["machineId", "machine", "liters", "meterValue", "note"]);
    expect(keys({ machineId: newId() }, true)).toEqual(["machineId", "liters", "meterValue", "note"]);
    expect(keys({}, false)).toEqual(["machine", "liters", "meterValue", "note"]);
  });
  it("el registro se valida con el esquema compartido; la app lo ofrece en cualquier lote", () => {
    expect(parseRecordData("fuel_load", { machine: "John Deere", liters: 120, meterValue: 4310.5 }).success).toBe(true);
    expect(parseRecordData("fuel_load", { machine: "John Deere", liters: 0 }).success).toBe(false);
    expect(KINDS_FOR("crop")).toContain("fuel_load");
    expect(KINDS_FOR(null)).toContain("fuel_load");
  });
});

describe("orden de trabajo en la tarea (E-20, E-21)", () => {
  const task = (workOrder: string | null) => ({
    id: newId(),
    organizationId: ORG,
    farmId: newId(),
    plotId: null,
    assigneeId: newId(),
    title: "Pulverización",
    kind: "application",
    dueDate: "2026-11-20",
    dueTime: null,
    priority: "normal",
    comments: "[]",
    recurrence: "none",
    status: "open",
    completedAt: null,
    completedBy: null,
    recordId: null,
    prescription: null,
    workOrder,
    createdBy: newId(),
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    version: 1,
  });
  it("baja con la tarea y se lee validada; lo dañado o ausente es null", async () => {
    const db = setup();
    const order = { labor: "spraying", areaHa: 10, products: [{ productId: newId(), name: "Glifosato", dose: 2, unit: "l_ha" }] };
    const a = task(JSON.stringify(order));
    const b = task("no es json");
    const c = task(null);
    await db.applyPull("tasks", [a, b, c], null);
    expect(db.orderOf(a.id)).toMatchObject({ labor: "spraying", areaHa: 10, products: [{ name: "Glifosato" }] });
    expect(db.orderOf(b.id)).toBeNull();
    expect(db.orderOf(c.id)).toBeNull();
  });
});

describe("recuento de depósito (E-15)", () => {
  it("canCount: dueño, administrador y agrónomo; el empleado no", async () => {
    const { canCount } = await import("../src/lib/stock-count");
    expect(["owner", "admin", "agronomist", "worker", undefined].map(canCount)).toEqual([true, true, true, false, false]);
  });

  it("parseCounted acepta coma o punto y descarta vacío, texto y negativos", async () => {
    const { parseCounted } = await import("../src/lib/stock-count");
    expect(["12,5", " 12.5 ", "0", "", "abc", "-1", undefined].map(parseCounted)).toEqual([12.5, 12.5, 0, null, null, null, null]);
  });

  it("buildCountData cuenta solo lo escrito (el 0 cuenta) y es válido para el esquema", async () => {
    const { buildCountData } = await import("../src/lib/stock-count");
    const wh = newId();
    const [a, b, c] = [newId(), newId(), newId()];
    expect(buildCountData(wh, { [a]: "3,5", [b]: "", [c]: "0" }, " fin de mes ")).toEqual({
      warehouseId: wh,
      lines: [{ productId: a, counted: 3.5 }, { productId: c, counted: 0 }],
      note: "fin de mes",
    });
    expect(buildCountData(wh, { [a]: "" })).toBeNull();
    expect(buildCountData(wh, { "no-es-uuid": "3" })).toBeNull();
  });

  it("el recuento se guarda sin señal en una transacción con su mutación en el outbox y los depósitos bajan al celular", async () => {
    const { buildCountData } = await import("../src/lib/stock-count");
    const db = setup();
    const farmId = newId();
    const whId = newId();
    const productId = newId();
    const data = buildCountData(whId, { [productId]: "7" })!;
    const id = db.saveRecord(newId(), ORG, { farmId, plotId: null, poiId: null, kind: "stock_count", data, lon: null, lat: null, gpsAccuracyM: null, capturedAt: Date.now() });
    const queued = db.outboxItems();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ what: "record", recordKind: "stock_count" });
    expect(id).toBeTruthy();
    expect(db.warehouses()).toEqual([]);
  });
});
