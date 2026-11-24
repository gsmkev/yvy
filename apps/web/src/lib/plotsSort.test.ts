import { describe, expect, it } from "vitest";
import { sortPlots } from "./plotsSort";
import type { Plot } from "./types";

const p = (name: string, o: Partial<Plot> = {}): Plot => ({
  id: name,
  farmId: "f",
  name,
  kind: "crop",
  geometry: "",
  areaHa: 10,
  crop: null,
  season: null,
  sowingDate: null,
  pastureType: null,
  color: null,
  ndviMean: null,
  ndviAt: null,
  ndviPrevMean: null,
  ndviPrevAt: null,
  lastRecordAt: null,
  ...o,
});

describe("sortPlots", () => {
  const plots = [p("B", { ndviMean: 0.5, areaHa: 5 }), p("A"), p("C", { ndviMean: 0.7, areaHa: 50 })];
  it("ordena por vigor y deja sin dato al final en ambos sentidos", () => {
    expect(sortPlots(plots, "vigor", "desc").map((x) => x.name)).toEqual(["C", "B", "A"]);
    expect(sortPlots(plots, "vigor", "asc").map((x) => x.name)).toEqual(["B", "C", "A"]);
  });
  it("ordena por nombre y superficie", () => {
    expect(sortPlots(plots, "name", "asc").map((x) => x.name)).toEqual(["A", "B", "C"]);
    expect(sortPlots(plots, "area", "desc").map((x) => x.name)).toEqual(["C", "A", "B"]);
  });
  it("ordena por última visita", () => {
    const v = [p("A", { lastRecordAt: 1 }), p("B", { lastRecordAt: 9 }), p("C")];
    expect(sortPlots(v, "visit", "desc").map((x) => x.name)).toEqual(["B", "A", "C"]);
  });
});
