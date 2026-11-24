import { describe, expect, it } from "vitest";
import { cattleYear, priceFor } from "../src/pricing";

describe("priceFor", () => {
  it("ejemplo del ADR: 10.000 ha de ganadería = US$ 1.800 al año", () => {
    expect(cattleYear(10_000)).toBeCloseTo(1800);
    const p = priceFor(0, 10_000, "monthly");
    expect(p.year).toBeCloseTo(1800);
    expect(p.perInstallment).toBeCloseTo(150);
    expect(p.minApplied).toBe(false);
  });
  it("bordes de cada escalón", () => {
    expect(cattleYear(2_000)).toBeCloseTo(600);
    expect(cattleYear(2_001)).toBeCloseTo(600.15);
    expect(cattleYear(10_000)).toBeCloseTo(1800);
    expect(cattleYear(10_001)).toBeCloseTo(1800.08);
    expect(cattleYear(30_000)).toBeCloseTo(1800 + 20_000 * 0.08);
  });
  it("agricultura sin escalones y suma con ganadería", () => {
    expect(priceFor(10_000, 0).year).toBeCloseTo(8000);
    expect(priceFor(1000, 2000).year).toBeCloseTo(800 + 600);
  });
  it("aplica el mínimo de US$ 40 por mes equivalente", () => {
    const p = priceFor(0, 0);
    expect(p).toMatchObject({ year: 480, perInstallment: 40, installments: 12, perHa: 0, minApplied: true });
    expect(priceFor(500, 0).minApplied).toBe(true); // 400 al año
    expect(priceFor(600, 0).minApplied).toBe(false); // 480 justos
    expect(priceFor(NaN, -5).year).toBe(480);
  });
  it("tres formas de pago", () => {
    const m = priceFor(0, 10_000, "monthly");
    const c = priceFor(0, 10_000, "cycle");
    const a = priceFor(0, 10_000, "annual");
    expect([m.installments, c.installments, a.installments]).toEqual([12, 2, 1]);
    expect(m.year).toBeCloseTo(1800);
    expect(c.year).toBeCloseTo(1800);
    expect(c.perInstallment).toBeCloseTo(900);
    expect(a.year).toBeCloseTo(1500); // 12 meses al precio de 10
    expect(a.perInstallment).toBeCloseTo(1500);
    expect(a.perHa).toBeCloseTo(0.15);
    expect(priceFor(0, 0, "annual").year).toBeCloseTo(400);
  });
});
