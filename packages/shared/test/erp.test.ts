import { describe, expect, it } from "vitest";
import { avgUnitCost, moveValue } from "../src/erp";

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
