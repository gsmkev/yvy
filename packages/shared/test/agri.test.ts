import { describe, expect, it } from "vitest";
import { describeRecord, parseRecordData } from "../src";

describe("siembra (sowing)", () => {
  it("pide cultivo y, si hay densidad, su unidad", () => {
    expect(parseRecordData("sowing", { crop: "soja" }).success).toBe(true);
    expect(parseRecordData("sowing", { crop: "soja", density: 14, densityUnit: "seeds_m", areaHa: 30 }).success).toBe(true);
    expect(parseRecordData("sowing", { crop: "soja", density: 14 }).success).toBe(false);
    expect(parseRecordData("sowing", {}).success).toBe(false);
    expect(parseRecordData("sowing", { crop: "papa" }).success).toBe(false);
    expect(parseRecordData("sowing", { crop: "soja", areaHa: 0 }).success).toBe(false);
    expect(parseRecordData("sowing", { crop: "soja", seasonId: "no-es-uuid" }).success).toBe(false);
  });
  it("se describe en es-PY", () => {
    expect(describeRecord("sowing", { crop: "soja", variety: "DM 6563", density: 14, densityUnit: "seeds_m", areaHa: 30 })).toBe(
      "Soja · DM 6563 · 14 semillas por metro · 30 ha",
    );
  });
});

import { deltaT } from "../src";

describe("Delta T", () => {
  it("valores de referencia", () => {
    expect(deltaT(25, 50)).toBeGreaterThan(6.8);
    expect(deltaT(25, 50)).toBeLessThan(7.8);
    expect(deltaT(25, 95)!).toBeLessThan(1);
    expect(deltaT(35, 30)!).toBeGreaterThan(deltaT(25, 50)!);
  });
  it("fuera de rango o datos inválidos devuelve null", () => {
    expect(deltaT(25, 2)).toBeNull();
    expect(deltaT(60, 50)).toBeNull();
    expect(deltaT(NaN, 50)).toBeNull();
  });
});

describe("aplicación (application)", () => {
  const dose = { name: "Glifosato", dose: 2, unit: "l_ha" };
  it("calcula el Delta T al validar y descarta el que venga de afuera", () => {
    const r = parseRecordData("application", { products: [dose], tempC: 25, humidityPct: 50, deltaT: 99 });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as { deltaT?: number }).deltaT).toBe(deltaT(25, 50));
    const sin = parseRecordData("application", { products: [dose], tempC: 25 });
    expect(sin.success && (sin.data as { deltaT?: number }).deltaT).toBeUndefined();
  });
  it("pide productos con dosis y unidad válidas", () => {
    expect(parseRecordData("application", { products: [] }).success).toBe(false);
    expect(parseRecordData("application", { products: [{ ...dose, unit: "t_ha" }] }).success).toBe(false);
    expect(parseRecordData("application", { products: [{ ...dose, dose: 0 }] }).success).toBe(false);
  });
  it("se describe en es-PY", () => {
    expect(
      describeRecord("application", {
        products: [dose, { name: "Aceite", dose: 0.5, unit: "l_ha" }],
        areaHa: 30,
        deltaT: 4.2,
      }),
    ).toBe("Glifosato 2 L/ha + Aceite 0,5 L/ha · 30 ha · Delta T 4,2");
  });
});
