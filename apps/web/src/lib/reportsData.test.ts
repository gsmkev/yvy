/** Pruebas de datos de informes. */
import { describe, expect, it } from "vitest";
import { mapLimit, seasonStart, vigorSummary } from "./reportsData";

describe("datos de informes", () => {
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
