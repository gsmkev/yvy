import { describe, expect, it } from "vitest";
import { combineAreas } from "./importGeo";

const sq = (x: number) => ({
  type: "Polygon" as const,
  coordinates: [
    [
      [x, 0],
      [x + 1, 0],
      [x + 1, 1],
      [x, 1],
      [x, 0],
    ],
  ],
});

describe("M-09: perímetro de varias partes", () => {
  it("una figura queda Polygon, varias pasan a MultiPolygon (aplanando multipolígonos)", () => {
    expect(combineAreas([])).toBeNull();
    expect(combineAreas([sq(0)])).toEqual(sq(0));
    const m = combineAreas([sq(0), { type: "MultiPolygon", coordinates: [sq(2).coordinates, sq(4).coordinates] }]);
    expect(m?.type).toBe("MultiPolygon");
    expect(m?.coordinates).toHaveLength(3);
  });
});
