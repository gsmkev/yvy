import { describe, expect, it } from "vitest";
import { compactMoney } from "../src/office/adminMoney";

describe("cifras de tarjeta", () => {
  it("guaraníes en millones con una unidad corta", () => {
    expect(compactMoney(2_423_524_012, "PYG")).toEqual({ value: "2.424 M", unit: "Gs." });
    expect(compactMoney(399_435_000, "PYG")).toEqual({ value: "399,4 M", unit: "Gs." });
  });
  it("guaraníes bajo el millón, completos", () => {
    expect(compactMoney(750_000, "PYG")).toEqual({ value: "750.000", unit: "Gs." });
    expect(compactMoney(-45_000, "PYG")).toEqual({ value: "-45.000", unit: "Gs." });
  });
  it("dólares: sin centavos desde 10.000", () => {
    expect(compactMoney(19_832_539, "USD")).toEqual({ value: "198.325", unit: "US$" });
    expect(compactMoney(12_550, "USD")).toEqual({ value: "125,5", unit: "US$" });
  });
});
