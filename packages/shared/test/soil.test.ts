import { describe, expect, it } from "vitest";
import { soilAverage, soilLevel } from "../src";

describe("suelo (A-30)", () => {
  it("clasifica por rangos de referencia", () => {
    expect(soilLevel("ph", 4.6)).toBe("low");
    expect(soilLevel("ph", 5.8)).toBe("medium");
    expect(soilLevel("ph", 7)).toBe("high");
    expect(soilLevel("pMgKg", 8)).toBe("medium");
    expect(soilLevel("omPct", null)).toBeNull();
  });
  it("promedia ignorando los valores que faltan", () => {
    const r = soilAverage([
      { ph: 5, pMgKg: 10, kCmolKg: null, omPct: 2 },
      { ph: 6, pMgKg: null, kCmolKg: null, omPct: 3 },
    ]);
    expect(r).toEqual({ ph: 5.5, pMgKg: 10, kCmolKg: null, omPct: 2.5 });
  });
});
