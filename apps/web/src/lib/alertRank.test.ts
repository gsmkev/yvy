import { describe, expect, it } from "vitest";
import { sortAlerts, sortReview } from "./alertRank";

describe("alertRank", () => {
  it("avisos: alerta antes que atención y que información; el más nuevo primero", () => {
    const l = [
      { id: "a", severity: "info", validFrom: 5 },
      { id: "b", severity: "watch", validFrom: 1 },
      { id: "c", severity: "warning", validFrom: 1 },
      { id: "d", severity: "watch", validFrom: 3 },
    ];
    expect(sortAlerts(l).map((x) => x.id)).toEqual(["c", "d", "b", "a"]);
  });
  it("para revisar: dosis y rinde primero, luego lluvia y plagas", () => {
    const l = [
      { id: "p", capturedAt: 9, oddities: [{ rule: "pest_off_season" }] },
      { id: "r", capturedAt: 8, oddities: [{ rule: "rain_high" }] },
      { id: "d", capturedAt: 1, oddities: [{ rule: "rain_high" }, { rule: "dose_out_of_range" }] },
      { id: "y", capturedAt: 7, oddities: [{ rule: "yield_impossible" }] },
    ];
    expect(sortReview(l).map((x) => x.id)).toEqual(["d", "y", "r", "p"]);
  });
});
