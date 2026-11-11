import { describe, expect, it } from "vitest";
import { priceFor } from "./pricing";

describe("priceFor", () => {
  it("aplica el mínimo de US$ 40 por mes", () => {
    expect(priceFor(0, 0)).toEqual({ month: 40, year: 480, minApplied: true });
    expect(priceFor(500, 0).minApplied).toBe(true);
  });
  it("suma agricultura y ganadería por hectárea y año", () => {
    const p = priceFor(1000, 2000);
    expect(p.year).toBeCloseTo(1400);
    expect(p.month).toBeCloseTo(1400 / 12);
    expect(p.minApplied).toBe(false);
  });
  it("ignora valores inválidos", () => {
    expect(priceFor(NaN, -5).month).toBe(40);
  });
});
