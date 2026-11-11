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

describe("fertilización", () => {
  const fert = { name: "Urea", dose: 150, unit: "kg_ha" };
  it("kg/ha con método", () => {
    expect(parseRecordData("fertilization", { products: [fert], method: "foliar", areaHa: 10 }).success).toBe(true);
    expect(parseRecordData("fertilization", { products: [{ ...fert, unit: "l_ha" }], method: "foliar" }).success).toBe(false);
    expect(parseRecordData("fertilization", { products: [fert] }).success).toBe(false);
  });
  it("se describe en es-PY", () => {
    expect(describeRecord("fertilization", { products: [fert], method: "broadcast", areaHa: 40 })).toBe(
      "Urea 150 kg/ha · al voleo · 40 ha",
    );
  });
});

import { yieldTHa } from "../src";

describe("cosecha (harvest) y rinde", () => {
  it("valida toneladas, humedad y destino", () => {
    expect(parseRecordData("harvest", { tons: 120.5, moisturePct: 13, areaHa: 40, destination: "acopio" }).success).toBe(true);
    expect(parseRecordData("harvest", { tons: 0 }).success).toBe(false);
    expect(parseRecordData("harvest", { tons: 5, moisturePct: 101 }).success).toBe(false);
    expect(parseRecordData("harvest", { tons: 5, destination: "puerto" }).success).toBe(false);
  });
  it("rinde con superficie de cada cosecha o con la del lote", () => {
    expect(yieldTHa([{ tons: 60, areaHa: 20 }, { tons: 30, areaHa: 10 }], 99)).toBe(3);
    expect(yieldTHa([{ tons: 90 }], 30)).toBe(3);
    expect(yieldTHa([{ tons: 60, areaHa: 20 }, { tons: 30 }], 30)).toBe(3);
    expect(yieldTHa([], 30)).toBeNull();
    expect(yieldTHa([{ tons: 10 }], 0)).toBeNull();
  });
  it("se describe en es-PY", () => {
    expect(describeRecord("harvest", { tons: 120.5, moisturePct: 13, destination: "silo" })).toBe(
      "120,5 t · 13 % de humedad · silo propio",
    );
  });
});

import { sprayHour, sprayWindows, LIMITS } from "../src";

describe("ventanas para pulverizar", () => {
  const ok = { tempC: 25, windKmh: 8, humidityPct: 60, precipMm: 0 };
  it("apta con viento 3-15 km/h, Delta T 2-8 y sin lluvia", () => {
    const r = sprayHour(ok);
    expect(r.ok).toBe(true);
    expect(r.deltaT).toBeGreaterThanOrEqual(LIMITS.spray.deltaTMin);
    expect(r.deltaT).toBeLessThanOrEqual(LIMITS.spray.deltaTMax);
  });
  it("no apta: poco o mucho viento, lluvia, aire muy húmedo o muy seco", () => {
    expect(sprayHour({ ...ok, windKmh: 2 }).ok).toBe(false);
    expect(sprayHour({ ...ok, windKmh: 3 }).ok).toBe(true);
    expect(sprayHour({ ...ok, windKmh: 15 }).ok).toBe(true);
    expect(sprayHour({ ...ok, windKmh: 15.1 }).ok).toBe(false);
    expect(sprayHour({ ...ok, precipMm: 0.1 }).ok).toBe(false);
    expect(sprayHour({ ...ok, humidityPct: 95 }).ok).toBe(false); // Delta T bajo
    expect(sprayHour({ tempC: 38, windKmh: 8, humidityPct: 25, precipMm: 0 }).ok).toBe(false); // Delta T alto
  });
  it("sin datos no es apta", () => {
    expect(sprayHour({ ...ok, windKmh: null }).ok).toBe(false);
    expect(sprayHour({ ...ok, humidityPct: null }).deltaT).toBeNull();
    expect(sprayHour({ ...ok, humidityPct: null }).ok).toBe(false);
  });
  it("junta horas aptas consecutivas en ventanas", () => {
    const H = 3_600_000;
    const t0 = Date.parse("2026-11-10T09:00:00Z");
    const hours = [1, 1, 0, 1, 1, 1, 0, 1].map((v, i) => ({ at: t0 + i * H, ok: v === 1 }));
    expect(sprayWindows(hours)).toEqual([
      { from: t0, to: t0 + 2 * H },
      { from: t0 + 3 * H, to: t0 + 6 * H },
      { from: t0 + 7 * H, to: t0 + 8 * H },
    ]);
    expect(sprayWindows([])).toEqual([]);
    expect(sprayWindows(hours.map((h) => ({ ...h, ok: false })))).toEqual([]);
  });
});
