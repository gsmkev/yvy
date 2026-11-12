import { describe, expect, it } from "vitest";
import { accumulateGdd, comparePheno, estimateStage, gddDay, nextStage } from "../src";

describe("fenología por grados-día (A-04)", () => {
  it("gddDay acota por la base y el tope", () => {
    expect(gddDay(20, 30, 10, 30)).toBe(15);
    expect(gddDay(5, 12, 10, 30)).toBe(1); // (10 + 12) / 2 - 10
    expect(gddDay(2, 8, 10, 30)).toBe(0); // todo debajo de la base
    expect(gddDay(25, 40, 10, 30)).toBe(17.5); // el tope corta los 40
  });

  it("acumula desde la siembra y cuenta los días con dato", () => {
    const days = [
      { date: "2026-10-01", tminC: 20, tmaxC: 30 }, // antes de sembrar: no cuenta
      { date: "2026-10-05", tminC: 20, tmaxC: 30 },
      { date: "2026-10-06", tminC: null, tmaxC: null },
      { date: "2026-10-07", tminC: 18, tmaxC: 28 },
    ];
    expect(accumulateGdd(days, "soja", "2026-10-05")).toEqual({ gdd: 28, days: 2 });
    expect(accumulateGdd(days, "chia", "2026-10-05")).toBeNull();
  });

  it("estima la etapa y cuánto falta para la siguiente", () => {
    expect(estimateStage("soja", 0)).toBe("siembra");
    expect(estimateStage("soja", 100)).toBe("emergencia");
    expect(estimateStage("soja", 700)).toBe("floracion");
    expect(estimateStage("soja", 5000)).toBe("cosecha");
    expect(estimateStage("otro", 700)).toBeNull();
    expect(nextStage("soja", 700)).toEqual({ stage: "llenado", gddLeft: 350 });
    expect(nextStage("soja", 5000)).toBeNull();
  });

  it("compara lo observado con lo estimado con una etapa de tolerancia", () => {
    expect(comparePheno("floracion", "floracion")).toBe("on_track");
    expect(comparePheno("floracion", "llenado")).toBe("on_track");
    expect(comparePheno("floracion", "vegetativo")).toBe("on_track");
    expect(comparePheno("floracion", "madurez")).toBe("ahead");
    expect(comparePheno("floracion", "emergencia")).toBe("behind");
  });
});
