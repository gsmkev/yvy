import { describe, expect, it } from "vitest";
import { cleanArea, cleanRing, validatePolygon } from "../src";

const sq = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];

describe("cleanRing (M-11)", () => {
  it("no toca un anillo limpio", () => {
    expect(cleanRing(sq)).toEqual({ ring: sq, removed: 0 });
  });

  it("quita vértices consecutivos duplicados", () => {
    const r = cleanRing([[0, 0], [1, 0], [1, 0], [1, 1], [1, 1], [0, 1], [0, 0]]);
    expect(r.ring).toEqual(sq);
    expect(r.removed).toBe(2);
  });

  it("quita espigas de área cero", () => {
    const r = cleanRing([[0, 0], [1, 0], [2, 0], [1, 0], [1, 1], [0, 1], [0, 0]]);
    expect(r.ring).toEqual(sq);
    expect(r.removed).toBe(2);
  });

  it("limpia la unión de cierre", () => {
    const r = cleanRing([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0], [0, 0]]);
    expect(r.ring).toEqual(sq);
    expect(r.removed).toBe(1);
  });

  it("cleanArea suma lo quitado y deja polígonos válidos", () => {
    const r = cleanArea({
      type: "MultiPolygon",
      coordinates: [[[[0, 0], [1, 0], [1, 0], [1, 1], [0, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 5]]]],
    });
    expect(r.removed).toBe(1);
    expect(validatePolygon(r.geometry)).toBeNull();
  });
});
