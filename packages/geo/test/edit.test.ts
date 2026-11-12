import { describe, expect, it } from "vitest";
import type { LineString, Polygon } from "geojson";
import { areaHa, lineLengthM, mergePolygons, splitPolygon, validatePolygon } from "../src";

const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => ({
  type: "Polygon",
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
});
const line = (...c: number[][]): LineString => ({ type: "LineString", coordinates: c });

describe("splitPolygon (M-05)", () => {
  const sq = rect(-57, -25, -56.99, -24.99);

  it("divide un cuadrado por la mitad sin perder superficie", () => {
    const r = splitPolygon(sq, line([-56.995, -25.1], [-56.995, -24.9]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [a, b] = r.parts.map(areaHa) as [number, number];
    expect(a).toBeCloseTo(b, 1);
    expect(a + b).toBeCloseTo(areaHa(sq), 4);
    for (const p of r.parts) expect(validatePolygon(p)).toBeNull();
  });

  it("divide en diagonal y respeta los quiebres de la línea", () => {
    const r = splitPolygon(sq, line([-57.01, -25.01], [-56.995, -24.995], [-56.995, -24.98]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(areaHa(r.parts[0]) + areaHa(r.parts[1])).toBeCloseTo(areaHa(sq), 4);
    expect(areaHa(r.parts[0])).not.toBeCloseTo(areaHa(r.parts[1]), 1);
  });

  it("reparte los huecos entre las partes", () => {
    const withHole: Polygon = {
      type: "Polygon",
      coordinates: [...sq.coordinates, [[-56.998, -24.998], [-56.998, -24.996], [-56.996, -24.996], [-56.996, -24.998], [-56.998, -24.998]]],
    };
    const r = splitPolygon(withHole, line([-56.995, -25.1], [-56.995, -24.9]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parts.map((p) => p.coordinates.length).sort()).toEqual([1, 2]);
    expect(areaHa(r.parts[0]) + areaHa(r.parts[1])).toBeCloseTo(areaHa(withHole), 4);
  });

  it("rechaza una línea que no cruza dos veces", () => {
    expect(splitPolygon(sq, line([-56.995, -24.995], [-56.995, -24.9]))).toEqual({ ok: false, error: "must_cross_twice" });
    expect(splitPolygon(sq, line([-58, -25.5], [-58, -24]))).toEqual({ ok: false, error: "must_cross_twice" });
    const u: Polygon = {
      type: "Polygon",
      coordinates: [[[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3], [0, 0]]],
    };
    expect(splitPolygon(u, line([-1, 2], [4, 2]))).toEqual({ ok: false, error: "must_cross_twice" });
  });

  it("rechaza una línea que atraviesa un hueco", () => {
    const withHole: Polygon = {
      type: "Polygon",
      coordinates: [...sq.coordinates, [[-56.998, -24.998], [-56.998, -24.996], [-56.996, -24.996], [-56.996, -24.998], [-56.998, -24.998]]],
    };
    expect(splitPolygon(withHole, line([-56.997, -25.1], [-56.997, -24.9]))).toEqual({ ok: false, error: "crosses_hole" });
  });

  it("rechaza líneas de un solo punto", () => {
    expect(splitPolygon(sq, line([0, 0]))).toEqual({ ok: false, error: "line_too_short" });
  });
});

describe("mergePolygons (M-05)", () => {
  it("une dos lotes que comparten un borde", () => {
    const a = rect(-57, -25, -56.99, -24.99);
    const b = rect(-56.99, -25, -56.98, -24.99);
    const r = mergePolygons(a, b);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(areaHa(r.polygon)).toBeCloseTo(areaHa(a) + areaHa(b), 3);
    expect(r.polygon.coordinates[0]!.length).toBe(5);
  });

  it("dividir y volver a unir devuelve la misma superficie", () => {
    const sq = rect(-57, -25, -56.99, -24.99);
    const s = splitPolygon(sq, line([-56.995, -25.1], [-56.995, -24.9]));
    if (!s.ok) throw new Error("no dividió");
    const m = mergePolygons(s.parts[0], s.parts[1]);
    expect(m.ok && areaHa(m.polygon)).toBeCloseTo(areaHa(sq), 4);
  });

  it("rechaza lotes separados", () => {
    expect(mergePolygons(rect(0, 0, 1, 1), rect(2, 2, 3, 3))).toEqual({ ok: false, error: "not_adjacent" });
  });
});

describe("lineLengthM", () => {
  it("mide un grado de latitud en unos 111 km", () => {
    expect(lineLengthM(line([0, 0], [0, 1]))).toBeGreaterThan(110_000);
    expect(lineLengthM(line([0, 0], [0, 1]))).toBeLessThan(112_000);
  });
});
