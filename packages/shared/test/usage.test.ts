import { describe, expect, it } from "vitest";
import { consumptionLines, parseRecordData } from "../src";

const id = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const units = new Map([[id, "l" as const]]);

describe("consumo real al cerrar la orden (E-21)", () => {
  it("usa la cantidad usada si está; si no, dosis por superficie", () => {
    const base = { productId: id, name: "G", dose: 2, unit: "l_ha" as const };
    expect(consumptionLines("application", { areaHa: 8, products: [base] }, { plotAreaHa: null, units })).toEqual([{ productId: id, qty: 16 }]);
    expect(consumptionLines("application", { areaHa: 8, products: [{ ...base, usedQty: 18 }] }, { plotAreaHa: null, units })).toEqual([{ productId: id, qty: 18 }]);
    // en mL/ha la cantidad usada está en mL
    expect(consumptionLines("application", { products: [{ ...base, unit: "ml_ha", usedQty: 500 }] }, { plotAreaHa: null, units })).toEqual([{ productId: id, qty: 0.5 }]);
  });
  it("el esquema acepta usedQty positivo y rechaza 0", () => {
    const p = (usedQty: number) => parseRecordData("application", { products: [{ name: "G", dose: 1, unit: "l_ha", usedQty }] }).success;
    expect(p(18)).toBe(true);
    expect(p(0)).toBe(false);
  });
});
