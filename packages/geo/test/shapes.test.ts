/** Formas no cuadradas (docs/REVISION.md §1). Lo marcado como `todo` son límites conocidos. */
import { describe, expect, it } from "vitest";
import { areaHa, centroidOf, containsPoint, validatePolygon } from "../src";

const tri = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-55.95, -27.15],
      [-55.91, -27.15],
      [-55.93, -27.19],
      [-55.95, -27.15],
    ],
  ],
};
const rot = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-55.93, -27.14],
      [-55.9, -27.17],
      [-55.93, -27.2],
      [-55.96, -27.17],
      [-55.93, -27.14],
    ],
  ],
};
const outer = [
  [-55.95, -27.15],
  [-55.91, -27.15],
  [-55.91, -27.19],
  [-55.95, -27.19],
  [-55.95, -27.15],
];
const hole = {
  type: "Polygon" as const,
  coordinates: [
    outer,
    [
      [-55.94, -27.16],
      [-55.92, -27.16],
      [-55.92, -27.18],
      [-55.94, -27.18],
      [-55.94, -27.16],
    ],
  ],
};
const ele = {
  type: "Polygon" as const,
  coordinates: [
    [
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 2],
      [0, 2],
      [0, 0],
    ].map(([x, y]) => [-55.95 + x! * 0.02, -27.15 - y! * 0.02]),
  ],
};
const clockwise = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-55.95, -27.15],
      [-55.95, -27.19],
      [-55.91, -27.19],
      [-55.91, -27.15],
      [-55.95, -27.15],
    ],
  ],
};
const multi = {
  type: "MultiPolygon" as const,
  coordinates: [
    tri.coordinates,
    [
      [
        [-55.88, -27.15],
        [-55.86, -27.15],
        [-55.86, -27.17],
        [-55.88, -27.17],
        [-55.88, -27.15],
      ],
    ],
  ],
};

describe("formas no cuadradas", () => {
  it("triángulo: un punto dentro del bbox pero fuera del triángulo no cuenta", () => {
    expect(validatePolygon(tri)).toBeNull();
    expect(containsPoint(tri, -55.93, -27.16)).toBe(true);
    expect(containsPoint(tri, -55.915, -27.185)).toBe(false);
  });
  it("rombo rotado: la esquina del bbox queda fuera", () => {
    expect(validatePolygon(rot)).toBeNull();
    expect(containsPoint(rot, -55.955, -27.145)).toBe(false);
  });
  it("hueco: la laguna no es lote y no suma área", () => {
    expect(validatePolygon(hole)).toBeNull();
    expect(containsPoint(hole, -55.93, -27.17)).toBe(false);
    expect(areaHa(hole)).toBeLessThan(areaHa({ type: "Polygon", coordinates: [outer] }));
  });
  it("forma de L: válida; el centro del bbox puede caer fuera", () => {
    expect(validatePolygon(ele)).toBeNull();
    const c = centroidOf(ele);
    expect(typeof c.lon).toBe("number");
  });
  it.todo("etiquetas: usar un punto interior garantizado (point-on-feature), no el centro del bbox");
  it("sentido horario y multipolígono", () => {
    expect(validatePolygon(clockwise)).toBeNull();
    expect(areaHa(clockwise)).toBeGreaterThan(0);
    expect(validatePolygon(multi)).toBeNull();
    expect(areaHa(multi)).toBeGreaterThan(areaHa(tri));
  });
  it.todo("espiga (vértice de ida y vuelta) debería rechazarse como autointersección");
  it.todo("vértice duplicado debería limpiarse al importar");
});
