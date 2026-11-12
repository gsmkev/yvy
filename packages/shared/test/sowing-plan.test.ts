import { describe, expect, it } from "vitest";
import { sowingPlan } from "../src";

const plots = [
  { id: "a", kind: "crop" as const, areaHa: 100 },
  { id: "b", kind: "crop" as const, areaHa: 50.25 },
  { id: "c", kind: "crop" as const, areaHa: 20 },
  { id: "d", kind: "crop" as const, areaHa: 10 },
  { id: "p", kind: "pasture" as const, areaHa: 300 },
];
const plan = (plotId: string, crop: "soja" | "maiz" | null, variety: string | null, seasonId = "s1") => ({
  plotId,
  seasonId,
  crop,
  variety,
});

describe("plan de siembra (A-03)", () => {
  it("suma superficie por cultivo y variedad y calcula la semilla", () => {
    const r = sowingPlan(
      plots,
      [plan("a", "soja", "DM 6563"), plan("b", "soja", " dm 6563 "), plan("c", "maiz", null)],
      "s1",
    );
    expect(r.rows).toEqual([
      { crop: "soja", variety: "DM 6563", plots: 2, areaHa: 150.3, seedKg: 9015 },
      { crop: "maiz", variety: null, plots: 1, areaHa: 20, seedKg: 400 },
    ]);
    expect(r.plannedHa).toBe(170.3);
    expect(r.unplannedPlots).toBe(1);
    expect(r.unplannedHa).toBe(10);
  });
  it("ignora potreros y planes de otra campaña; la densidad se puede pisar", () => {
    const r = sowingPlan(
      plots,
      [plan("a", "soja", null), plan("b", "soja", null, "s2"), plan("p", "soja", null)],
      "s1",
      { soja: 50 },
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ plots: 1, areaHa: 100, seedKg: 5000 });
    expect(r.unplannedPlots).toBe(3);
  });
  it("un lote con plan sin cultivo está sin planificar", () => {
    expect(sowingPlan(plots, [plan("a", null, "X")], "s1").unplannedPlots).toBe(4);
  });
});
