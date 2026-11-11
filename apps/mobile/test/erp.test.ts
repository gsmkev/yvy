import { describe, expect, it } from "vitest";
import { newId, parseRecordData } from "@yvy/shared";
import { stepsFor } from "../src/lib/annotate";
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
    expect(keys({}, true)).toEqual(["reason", "productId", "product", "dose", "counts", "note"]);
    const id = newId();
    expect(keys({ productId: id }, true)).toEqual(["reason", "productId", "quantity", "dose", "counts", "note"]);
    // sin catálogo veterinario, el producto se escribe a mano como siempre
    expect(keys({}, false)).toEqual(["reason", "product", "dose", "counts", "note"]);
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
