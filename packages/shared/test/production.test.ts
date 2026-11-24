import { describe, expect, it } from "vitest";
import { pastureClassOf, plotLoad, productionIndicators, recommendedUaPerHa, weightSeries } from "../src";

describe("carga recomendada", () => {
  it("referencias por tipo de pastura y 30 % menos en invierno", () => {
    expect(recommendedUaPerHa("natural", 11)).toBe(0.5);
    expect(recommendedUaPerHa("implantada", 11)).toBe(1.2);
    expect(recommendedUaPerHa("mejorada", 3)).toBe(2);
    expect(recommendedUaPerHa("mejorada", 7)).toBe(1.4);
    expect(recommendedUaPerHa("natural", 6)).toBe(0.35);
    expect(recommendedUaPerHa("natural", 9)).toBe(0.5);
    expect(recommendedUaPerHa("natural", 11, { natural: 0.8 })).toBe(0.8);
  });
  it("interpreta el tipo de pastura escrito a mano", () => {
    expect(pastureClassOf("Campo natural")).toBe("natural");
    expect(pastureClassOf("Brachiaria brizantha")).toBe("implantada");
    expect(pastureClassOf("Pastura mejorada con riego")).toBe("mejorada");
    expect(pastureClassOf("")).toBe("natural");
    expect(pastureClassOf(null, "implantada")).toBe("implantada");
  });
  it("UA que sobran (positivo) o faltan (negativo)", () => {
    expect(plotLoad(60, 100, "natural", 11)).toMatchObject({ recommendedUa: 50, diffUa: 10 });
    expect(plotLoad(20, 100, "natural", 11).diffUa).toBe(-30);
  });
});

describe("indicadores por sistema", () => {
  const repro = { services: 100, checked: 100, pregnant: 80, calvedCows: 0, calvesBorn: 0, weaned: 0, pregnancyPct: 80, calvingPct: null, weaningPct: null };
  const series = weightSeries("a", "a", [
    { at: 0, kg: 200, head: 10 },
    { at: 100 * 86_400_000, kg: 250, head: 10 },
  ]);
  it("sin sistema o sin datos no hay indicadores", () => {
    expect(productionIndicators(null, { repro })).toEqual([]);
    expect(productionIndicators("cria", {})).toEqual([]);
    expect(productionIndicators("tambo", { repro })).toEqual([]);
  });
  it("cría muestra solo los que tienen dato", () => {
    expect(productionIndicators("cria", { repro })).toEqual([{ id: "pregnancyPct", value: 80, unit: "pct" }]);
  });
  it("invernada: GDP, kg por ha y días en campo", () => {
    const r = productionIndicators("invernada", { weights: [series], pastureHa: 50 });
    expect(r).toEqual([
      { id: "adg", value: 0.5, unit: "kg_day" },
      { id: "kgPerHaYear", value: 10, unit: "kg_ha_year" },
      { id: "daysInField", value: 100, unit: "days" },
    ]);
  });
  it("ciclo completo junta los dos juegos", () => {
    const ids = productionIndicators("ciclo_completo", { repro, weights: [series], pastureHa: 50 }).map((i) => i.id);
    expect(ids).toEqual(["pregnancyPct", "adg", "kgPerHaYear", "daysInField"]);
  });
});
