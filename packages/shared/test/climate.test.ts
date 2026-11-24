import { describe, expect, it } from "vitest";
import { campaignStart, gaugeTable, hasUnassignedRain, lastSatDate, mondayOf, normalBetween, rainBetween, gaugeVsSat, type ClimateData } from "../src/climate";

const at = (iso: string) => Date.parse(`${iso}T12:00:00-03:00`);
const climate: ClimateData = {
  daily: [
    { date: "2026-09-10", source: "chirps", precipMm: 20 },
    { date: "2026-10-05", source: "chirps", precipMm: 30 },
    { date: "2026-10-06", source: "chirps_prelim", precipMm: 10 },
    { date: "2026-10-07", source: "nasa_power", precipMm: 99 },
  ],
  climatology: [
    { dayOfYear: 253, variable: "precip", mean: 3 },
    { dayOfYear: 278, variable: "precip", mean: 2 },
    { dayOfYear: 279, variable: "precip", mean: 2 },
  ],
  gauge: [
    { capturedAt: at("2026-09-10"), mm: 25, poiId: "p1" },
    { capturedAt: at("2026-10-05"), mm: 18, poiId: "p1" },
    { capturedAt: at("2026-10-06"), mm: 12, poiId: "p1" },
    { capturedAt: at("2026-10-05"), mm: 7, poiId: "p2" },
    { capturedAt: at("2026-10-05"), mm: 4, poiId: null },
  ],
};

describe("lluvia de informes", () => {
  it("campaña, último día de satélite y lunes", () => {
    expect(campaignStart("2026-11-10")).toBe("2026-09-01");
    expect(campaignStart("2026-03-02")).toBe("2025-09-01");
    expect(lastSatDate(climate.daily, "2026-11-10")).toBe("2026-10-06");
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
  });
  it("satélite y normal", () => {
    expect(rainBetween(climate.daily, "2026-10-01", "2026-10-31")).toBe(139);
    expect(rainBetween(climate.daily, "2025-01-01", "2025-01-31")).toBeNull();
    expect(normalBetween([], "2026-11-01", "2026-11-02")).toBeNull();
  });
  it("totales por mes y de campaña por pluviómetro", () => {
    const { months, season } = gaugeTable(climate, "p1", "2026-09-01", "2026-10-06");
    expect(months.map((m) => m.key)).toEqual(["2026-09", "2026-10"]);
    expect(months[1]).toMatchObject({ gaugeMm: 30, satMm: 40 });
    expect(season.gaugeMm).toBe(55);
    expect(gaugeTable(climate, "p2", "2026-09-01", "2026-10-06").season.gaugeMm).toBe(7);
    expect(gaugeTable(climate, null, "2026-09-01", "2026-10-06").season.gaugeMm).toBe(4);
    expect(gaugeTable(climate, "p3", "2026-09-01", "2026-10-06").season.gaugeMm).toBeNull();
    expect(hasUnassignedRain(climate)).toBe(true);
  });
});

describe("lluvia de informes (casos de la web)", () => {
  it("lluvia: prefiere CHIRPS y no duplica días", () => {
    const daily = [
      { date: "2026-11-01", source: "nasa_power", precipMm: 9 },
      { date: "2026-11-01", source: "chirps", precipMm: 4 },
      { date: "2026-11-02", source: "chirps_prelim", precipMm: 6 },
      { date: "2026-12-01", source: "chirps", precipMm: 50 },
    ];
    expect(rainBetween(daily, "2026-11-01", "2026-11-30")).toBe(10);
    expect(rainBetween(daily, "2025-01-01", "2025-01-31")).toBeNull();
  });

  it("normal: suma solo los días con climatología", () => {
    const clim = [
      { dayOfYear: 305, variable: "precip", mean: 3 },
      { dayOfYear: 306, variable: "precip", mean: 2 },
      { dayOfYear: 306, variable: "soil_top", mean: 0.3 },
    ];
    expect(normalBetween(clim, "2026-11-01", "2026-11-02")).toBe(5);
    expect(normalBetween([], "2026-11-01", "2026-11-02")).toBeNull();
  });

  it("la campaña arranca el 1 de septiembre", () => {
    expect(campaignStart("2026-11-10")).toBe("2026-09-01");
    expect(campaignStart("2026-03-02")).toBe("2025-09-01");
    expect(campaignStart("2026-09-01")).toBe("2026-09-01");
  });

  it("el tramo comparado termina en el último día con CHIRPS", () => {
    expect(lastSatDate(climate.daily, "2026-11-10")).toBe("2026-10-06");
    expect(lastSatDate([], "2026-11-10")).toBe("2026-11-10");
  });

  it("diferencia contra el satélite", () => {
    expect(gaugeVsSat({ gaugeMm: 55, satMm: 50 })).toBeCloseTo(10);
    expect(gaugeVsSat({ gaugeMm: null, satMm: 50 })).toBeNull();
    expect(gaugeVsSat({ gaugeMm: 5, satMm: 0 })).toBeNull();
  });
});
