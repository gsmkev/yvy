import { describe, expect, it } from "vitest";
import { avgUnitCost, consumptionLines, consumptionProductIds, daysUntil, lotsRemaining, moveValue, type BaseUnit } from "../src/erp";

describe("costo promedio ponderado", () => {
  it("valor sobre cantidad", () => {
    expect(avgUnitCost({ qty: 200, valuePyg: 2_400_000, lastUnitCost: 14_000 })).toBe(12_000);
  });
  it("sin stock positivo usa la última compra; sin compras, 0", () => {
    expect(avgUnitCost({ qty: 0, valuePyg: 0, lastUnitCost: 14_000 })).toBe(14_000);
    expect(avgUnitCost({ qty: -5, valuePyg: -60_000, lastUnitCost: 12_000 })).toBe(12_000);
    expect(avgUnitCost({ qty: 0, valuePyg: 0, lastUnitCost: null })).toBe(0);
  });
  it("mover valoriza la cantidad absoluta, redondeada al guaraní", () => {
    expect(moveValue(-50, 12_000)).toBe(600_000);
    expect(moveValue(0.333, 10_000)).toBe(3_330);
    expect(moveValue(1, 3.3333)).toBe(3);
  });
});

describe("lotes (FEFO)", () => {
  const lots = [
    { lot: "B", expiresOn: "2027-02-01", qty: 100 },
    { lot: "A", expiresOn: "2026-12-01", qty: 100 },
    { lot: "S", expiresOn: null, qty: 50 },
  ];
  it("lo consumido sale primero del que vence antes; el sin fecha, al final", () => {
    expect(lotsRemaining(lots, 250).map((l) => [l.lot, l.remaining])).toEqual([["A", 100], ["B", 100], ["S", 50]]);
    expect(lotsRemaining(lots, 220).map((l) => [l.lot, l.remaining])).toEqual([["A", 70], ["B", 100], ["S", 50]]);
    expect(lotsRemaining(lots, 120).map((l) => [l.lot, l.remaining])).toEqual([["A", 0], ["B", 70], ["S", 50]]);
    expect(lotsRemaining(lots, 0).every((l) => l.remaining === 0)).toBe(true);
  });
  it("con más stock que lo comprado (ajustes) no se descuenta nada", () => {
    expect(lotsRemaining(lots, 400).map((l) => l.remaining)).toEqual([100, 100, 50]);
  });
  it("días entre fechas", () => {
    expect(daysUntil("2026-11-10", "2026-12-10")).toBe(30);
    expect(daysUntil("2026-11-10", "2026-11-07")).toBe(-3);
  });
});

describe("consumo de un registro de campo", () => {
  const units = new Map<string, BaseUnit>([
    ["gly", "l"],
    ["urea", "kg"],
    ["vac", "l"],
  ]);
  const ctx = { plotAreaHa: 20, units };
  it("dosis por hectárea x superficie hecha, con conversión de ml y g", () => {
    const data = {
      areaHa: 10,
      products: [
        { productId: "gly", name: "G", dose: 2, unit: "l_ha" },
        { productId: "urea", name: "U", dose: 250, unit: "g_ha" },
      ],
    };
    expect(consumptionLines("application", data, ctx)).toEqual([
      { productId: "gly", qty: 20 },
      { productId: "urea", qty: 2.5 },
    ]);
    expect(consumptionProductIds("application", data)).toEqual(["gly", "urea"]);
  });
  it("sin superficie del registro usa la del lote; sin ninguna, no consume", () => {
    const data = { products: [{ productId: "gly", name: "G", dose: 1, unit: "l_ha" }] };
    expect(consumptionLines("application", data, ctx)).toEqual([{ productId: "gly", qty: 20 }]);
    expect(consumptionLines("application", data, { ...ctx, plotAreaHa: null })).toEqual([]);
  });
  it("ignora lo que no es del catálogo y las dosis de otra familia; suma lo repetido", () => {
    const data = {
      areaHa: 1,
      products: [
        { name: "a mano", dose: 1, unit: "l_ha" },
        { productId: "desconocido", name: "x", dose: 1, unit: "l_ha" },
        { productId: "gly", name: "G", dose: 1, unit: "kg_ha" },
        { productId: "gly", name: "G", dose: 1, unit: "l_ha" },
        { productId: "gly", name: "G", dose: 500, unit: "ml_ha" },
      ],
    };
    expect(consumptionLines("fertilization", data, ctx)).toEqual([{ productId: "gly", qty: 1.5 }]);
  });
  it("sanidad: la cantidad anotada, solo con producto del catálogo", () => {
    expect(consumptionLines("health", { productId: "vac", quantity: 2 }, ctx)).toEqual([{ productId: "vac", qty: 2 }]);
    expect(consumptionLines("health", { productId: "vac" }, ctx)).toEqual([]);
    expect(consumptionLines("health", { product: "texto libre", quantity: 2 }, ctx)).toEqual([]);
    expect(consumptionLines("rain", { mm: 3 }, ctx)).toEqual([]);
  });
});
