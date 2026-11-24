import { describe, expect, it } from "vitest";
import type { Polygon } from "geojson";
import { areaHa, bboxOf, containsPoint, validatePolygon, validateShape } from "../src";

// ~1 km × ~1 km cerca de Asunción
const square: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [-57.6, -25.3],
      [-57.59, -25.3],
      [-57.59, -25.309],
      [-57.6, -25.309],
      [-57.6, -25.3],
    ],
  ],
};

describe("geo", () => {
  it("calcula área en ha", () => {
    const ha = areaHa(square);
    expect(ha).toBeGreaterThan(90);
    expect(ha).toBeLessThan(110);
  });

  it("calcula bbox", () => {
    expect(bboxOf(square)).toEqual({ minLon: -57.6, minLat: -25.309, maxLon: -57.59, maxLat: -25.3 });
  });

  it("punto en polígono", () => {
    expect(containsPoint(square, -57.595, -25.305)).toBe(true);
    expect(containsPoint(square, -57.5, -25.305)).toBe(false);
  });

  it("detecta anillo abierto y autointersección", () => {
    expect(
      validateShape({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [0, 0],
          ],
        ],
      }),
    ).toBe("ring_too_short");
    expect(
      validateShape({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0.5],
          ],
        ],
      }),
    ).toBe("ring_not_closed");
    const bowtie = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 1],
          [1, 0],
          [0, 1],
          [0, 0],
        ],
      ],
    };
    expect(validateShape(bowtie)).toBeNull();
    expect(validatePolygon(bowtie)).toBe("self_intersection");
    expect(validatePolygon(square)).toBeNull();
  });

  it("rechaza lo que no es polígono", () => {
    expect(validateShape({ type: "Point", coordinates: [0, 0] })).toBe("not_polygon");
    expect(validateShape(null)).toBe("not_polygon");
  });
});
