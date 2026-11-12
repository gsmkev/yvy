import { describe, expect, it } from "vitest";
import { campaignStart, gaugeTable, gaugeVsSat, hasUnassignedRain, lastSatDate, type GaugeClimate } from "./gaugeData";

const TZ = "America/Asuncion";
const at = (iso: string) => Date.parse(`${iso}T12:00:00-03:00`);

const climate: GaugeClimate = {
  daily: [
    { date: "2026-09-10", source: "chirps", precipMm: 20 },
    { date: "2026-10-05", source: "chirps", precipMm: 30 },
    { date: "2026-10-06", source: "chirps_prelim", precipMm: 10 },
    { date: "2026-10-07", source: "nasa_power", precipMm: 99 },
  ],
  climatology: [
    { dayOfYear: 253, variable: "precip", mean: 3 }, // 10 de septiembre
    { dayOfYear: 278, variable: "precip", mean: 2 }, // 5 de octubre
    { dayOfYear: 279, variable: "precip", mean: 2 }, // 6 de octubre
  ],
  gauge: [
    { capturedAt: at("2026-09-10"), mm: 25, poiId: "p1" },
    { capturedAt: at("2026-10-05"), mm: 18, poiId: "p1" },
    { capturedAt: at("2026-10-06"), mm: 12, poiId: "p1" },
    { capturedAt: at("2026-10-05"), mm: 7, poiId: "p2" },
    { capturedAt: at("2026-10-05"), mm: 4, poiId: null },
  ],
};

describe("pluviómetros contra satélite y normal", () => {
  it("la campaña arranca el 1 de septiembre", () => {
    expect(campaignStart("2026-11-10")).toBe("2026-09-01");
    expect(campaignStart("2026-03-02")).toBe("2025-09-01");
    expect(campaignStart("2026-09-01")).toBe("2026-09-01");
  });

  it("el tramo comparado termina en el último día con CHIRPS", () => {
    expect(lastSatDate(climate.daily, "2026-11-10")).toBe("2026-10-06");
    expect(lastSatDate([], "2026-11-10")).toBe("2026-11-10");
  });

  it("totales por mes y de campaña de un pluviómetro", () => {
    const { months, season } = gaugeTable(climate, "p1", "2026-09-01", "2026-10-06", TZ);
    expect(months.map((m) => m.key)).toEqual(["2026-09", "2026-10"]);
    expect(months[0]).toMatchObject({ gaugeMm: 25, satMm: 20, normalMm: 3, to: "2026-09-30" });
    expect(months[1]).toMatchObject({ gaugeMm: 30, satMm: 40, normalMm: 4, to: "2026-10-06" });
    expect(season).toMatchObject({ key: "season", gaugeMm: 55, satMm: 60, normalMm: 7 });
  });

  it("cada pluviómetro suma solo lo suyo y la lluvia sin pluviómetro va aparte", () => {
    expect(gaugeTable(climate, "p2", "2026-09-01", "2026-10-06", TZ).season.gaugeMm).toBe(7);
    expect(gaugeTable(climate, null, "2026-09-01", "2026-10-06", TZ).season.gaugeMm).toBe(4);
    expect(gaugeTable(climate, "p3", "2026-09-01", "2026-10-06", TZ).season.gaugeMm).toBeNull();
    expect(hasUnassignedRain(climate)).toBe(true);
  });

  it("diferencia contra el satélite", () => {
    expect(gaugeVsSat({ gaugeMm: 55, satMm: 50 })).toBeCloseTo(10);
    expect(gaugeVsSat({ gaugeMm: null, satMm: 50 })).toBeNull();
    expect(gaugeVsSat({ gaugeMm: 5, satMm: 0 })).toBeNull();
  });
});
