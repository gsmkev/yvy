import { describe, expect, it } from "vitest";
import { harvestYield, readYieldVigor, zoneYields, type ZoneYield } from "./yieldZones";

const box = (x0: number, x1: number) =>
  JSON.stringify({ type: "MultiPolygon", coordinates: [[[[x0, 0], [x1, 0], [x1, 1], [x0, 1], [x0, 0]]]] });
const zones = [
  { zone: 1 as const, areaHa: 10, meanNdvi: 0.5, geometry: box(0, 1) },
  { zone: 2 as const, areaHa: 10, meanNdvi: 0.7, geometry: box(1, 2) },
  { zone: 3 as const, areaHa: 10, meanNdvi: 0.85, geometry: box(2, 3) },
];
// seis celdas por zona con el rinde de cada una
const cells = (t: [number, number, number]): [number, number, number, number][] =>
  [0, 1, 2].flatMap((z) => Array.from({ length: 6 }, (_, i): [number, number, number, number] => [z + 0.1 + i * 0.1, 0.5, t[z]!, 10]));

describe("rinde por zona (A-22)", () => {
  it("promedia las celdas que caen dentro de cada zona", () => {
    const r = zoneYields(zones, cells([2, 3, 4]));
    expect(r.map((x) => x.meanTHa)).toEqual([2, 3, 4]);
    expect(r.every((x) => x.nCells === 6)).toBe(true);
  });
  it("una zona sin celdas queda sin rinde", () => {
    const r = zoneYields(zones, cells([2, 3, 4]).filter((c) => c[0] < 2));
    expect(r[2]).toMatchObject({ meanTHa: null, nCells: 0 });
  });
  it("lee que el rinde sigue al vigor", () => {
    expect(readYieldVigor(zoneYields(zones, cells([2, 3, 4])))).toMatchObject({ kind: "follows", diffPct: 100 });
  });
  it("distingue sin diferencia, inverso y mixto", () => {
    expect(readYieldVigor(zoneYields(zones, cells([3, 3.05, 3.1]))).kind).toBe("flat");
    expect(readYieldVigor(zoneYields(zones, cells([4, 3, 2]))).kind).toBe("inverse");
    expect(readYieldVigor(zoneYields(zones, cells([3, 4, 3.5]))).kind).toBe("mixed");
  });
  it("con pocas celdas no afirma nada", () => {
    const few: ZoneYield[] = [
      { zone: 1, areaHa: 1, ndvi: 0.5, meanTHa: 2, nCells: 2 },
      { zone: 3, areaHa: 1, ndvi: 0.8, meanTHa: 4, nCells: 3 },
    ];
    expect(readYieldVigor(few)).toEqual({ kind: "insufficient" });
    expect(readYieldVigor([])).toEqual({ kind: "insufficient" });
  });
  it("rinde del lote desde las cosechas registradas", () => {
    const recs = [{ data: { tons: 60, seasonId: "s1", areaHa: 20 } }, { data: { tons: 30, seasonId: "s1", areaHa: 10 } }, { data: { tons: 9, seasonId: "s2" } }];
    expect(harvestYield(recs, 50, "s1")).toMatchObject({ tHa: 3, tons: 90, count: 2 });
    expect(harvestYield(recs, 30, "s2")?.tHa).toBeCloseTo(0.3);
    expect(harvestYield(recs, 30, "s9")).toBeNull();
  });
});
