import { describe, expect, it } from "vitest";
import { mapLimit, normalBetween, rainBetween, seasonStart, vigorSummary } from "./reportsData";

describe("datos de informes", () => {
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

  it("inicio de campaña", () => {
    expect(seasonStart("2026-09-20", "2026-11-10")).toBe("2026-09-20");
    expect(seasonStart(null, "2026-11-10")).toBe("2026-05-14");
    expect(seasonStart("2020-01-01", "2026-11-10")).toBe("2025-11-10");
  });

  it("resumen de vigor", () => {
    const s = vigorSummary([
      { acquiredAt: 2, mean: 0.8, p10: 0.7, p90: 0.9, validPct: 100 },
      { acquiredAt: 1, mean: 0.4, p10: 0.3, p90: 0.5, validPct: 100 },
    ]);
    expect(s).toMatchObject({ n: 2, last: 0.8, max: 0.8, min: 0.4 });
    expect(s.mean).toBeCloseTo(0.6);
    expect(vigorSummary([]).last).toBeNull();
  });

  it("mapLimit conserva el orden", async () => {
    expect(await mapLimit([1, 2, 3, 4], 2, async (x) => x * 2)).toEqual([2, 4, 6, 8]);
  });
});
