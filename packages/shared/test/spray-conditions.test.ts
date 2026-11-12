import { describe, expect, it } from "vitest";
import { forecastHourAt, parseRecordData, sprayWarningTexts, sprayWarnings } from "../src";

describe("condiciones al aplicar (A-12)", () => {
  it("avisa con viento > 15 km/h y Delta T fuera de 2 a 8", () => {
    expect(sprayWarnings({ windKmh: 15, deltaT: 2 })).toEqual([]);
    expect(sprayWarnings({ windKmh: 16, deltaT: 8.1 })).toEqual(["windHigh", "deltaTHigh"]);
    expect(sprayWarnings({ deltaT: 1.9 })).toEqual(["deltaTLow"]);
    expect(sprayWarnings({})).toEqual([]);
    expect(sprayWarningTexts({ windKmh: 20 })[0]).toContain("20 km/h");
  });
  it("elige la hora del pronóstico que contiene a ahora", () => {
    const hs = [
      { at: 0, tempC: 20, windKmh: 5, humidityPct: 60 },
      { at: 3_600_000, tempC: 21, windKmh: 6, humidityPct: 55 },
    ];
    expect(forecastHourAt(hs, 3_600_001)?.tempC).toBe(21);
    expect(forecastHourAt(hs, 9_000_000)).toBeNull();
  });
  it("guarda el Delta T calculado con el registro", () => {
    const r = parseRecordData("application", { products: [{ name: "x", dose: 1, unit: "l_ha" }], windKmh: 10, tempC: 28, humidityPct: 50 });
    expect(r.success && (r.data as { deltaT?: number }).deltaT).toBeGreaterThan(0);
  });
});
