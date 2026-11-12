import { describe, expect, it } from "vitest";
import type { Polygon } from "geojson";
import { checkPlots, overlapRatio, withinRatio } from "../src";

/** Cuadrado de `size` grados con esquina noroeste en (lon, lat). */
const sq = (lon: number, lat: number, size: number): Polygon => ({
  type: "Polygon",
  coordinates: [
    [
      [lon, lat],
      [lon + size, lat],
      [lon + size, lat - size],
      [lon, lat - size],
      [lon, lat],
    ],
  ],
});

describe("overlapRatio y withinRatio (M-10)", () => {
  it("cajas que no se tocan: 0", () => {
    expect(overlapRatio(sq(-55.9, -27.2, 0.01), sq(-55.5, -27.2, 0.01))).toBe(0);
  });

  it("lotes que comparten solo el borde: 0", () => {
    expect(overlapRatio(sq(-55.9, -27.2, 0.01), sq(-55.89, -27.2, 0.01))).toBeCloseTo(0, 3);
  });

  it("mitad superpuesta: 0,5 del más chico", () => {
    const r = overlapRatio(sq(-55.9, -27.2, 0.01), sq(-55.895, -27.2, 0.01));
    expect(r).toBeCloseTo(0.5, 2);
  });

  it("uno dentro del otro: 1", () => {
    expect(overlapRatio(sq(-55.9, -27.2, 0.1), sq(-55.88, -27.22, 0.01))).toBeCloseTo(1, 3);
  });

  it("withinRatio: adentro, afuera y cortado", () => {
    const farm = sq(-55.9, -27.2, 0.1);
    expect(withinRatio(sq(-55.88, -27.22, 0.01), farm)).toBeCloseTo(1, 3);
    expect(withinRatio(sq(-55.5, -27.2, 0.01), farm)).toBe(0);
    expect(withinRatio(sq(-55.905, -27.2, 0.01), farm)).toBeCloseTo(0.5, 2);
  });

  it("checkPlots avisa superposición > 1 % y lotes fuera, y no avisa por rozar", () => {
    const farm = sq(-55.9, -27.2, 0.1);
    const plots = [
      sq(-55.89, -27.21, 0.01), // 0
      sq(-55.885, -27.21, 0.01), // 1: pisa a 0 al 50 %
      sq(-55.88, -27.21, 0.01), // 2: roza a 1 por el borde (y a 0 no llega)
      sq(-55.5, -27.21, 0.01), // 3: fuera
    ];
    const w = checkPlots(plots, farm);
    expect(w.filter((x) => x.kind === "overlap").map((x) => [x.a, x.b])).toEqual([[0, 1], [1, 2]]);
    expect(w.filter((x) => x.kind === "outside").map((x) => x.a)).toEqual([3]);
  });

  it("checkPlots no avisa en un caso limpio y sin perímetro", () => {
    expect(checkPlots([sq(-55.9, -27.2, 0.01), sq(-55.88, -27.2, 0.01)], null)).toEqual([]);
  });

  it("maxExact limita los recortes", () => {
    const plots = [sq(-55.9, -27.2, 0.01), sq(-55.895, -27.2, 0.01)];
    expect(checkPlots(plots, null, { maxExact: 0 })).toEqual([]);
  });
});
