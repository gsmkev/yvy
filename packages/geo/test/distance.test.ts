import { describe, expect, it } from "vitest";
import type { LineString, Polygon } from "geojson";
import { lineToAreaM, pointToAreaM, pointToLineM } from "../src";

// Un grado de latitud ~ 111,2 km; a -27° un grado de longitud ~ 99,1 km
const square: Polygon = {
  type: "Polygon",
  coordinates: [[[-55.9, -27.2], [-55.89, -27.2], [-55.89, -27.21], [-55.9, -27.21], [-55.9, -27.2]]],
};
const M_PER_DEG_LAT = 111_195;

describe("distancias (A-15)", () => {
  it("punto a polígono: 0 adentro y la distancia al borde afuera", () => {
    expect(pointToAreaM(-55.895, -27.205, square)).toBe(0);
    // 0,001° al norte del borde superior
    expect(pointToAreaM(-55.895, -27.199, square)).toBeCloseTo(0.001 * M_PER_DEG_LAT, -1);
    // 0,001° al este del borde derecho (~99 m)
    const east = pointToAreaM(-55.889, -27.205, square);
    expect(east).toBeGreaterThan(95);
    expect(east).toBeLessThan(103);
    // diagonal: más lejos que cualquiera de los dos ejes
    expect(pointToAreaM(-55.889, -27.199, square)).toBeGreaterThan(east);
  });

  it("punto a línea: distancia al tramo más cercano", () => {
    const l: LineString = { type: "LineString", coordinates: [[-55.9, -27.22], [-55.88, -27.22]] };
    expect(pointToLineM(-55.89, -27.219, l)).toBeCloseTo(0.001 * M_PER_DEG_LAT, -1);
    // más allá del extremo, mide al extremo
    const beyond = pointToLineM(-55.87, -27.22, l);
    expect(beyond).toBeGreaterThan(980);
    expect(beyond).toBeLessThan(1010);
  });

  it("línea a polígono: 0 si cruza o está adentro, y la distancia si no", () => {
    const crossing: LineString = { type: "LineString", coordinates: [[-55.895, -27.19], [-55.895, -27.22]] };
    expect(lineToAreaM(crossing, square)).toBe(0);
    const inside: LineString = { type: "LineString", coordinates: [[-55.897, -27.203], [-55.893, -27.207]] };
    expect(lineToAreaM(inside, square)).toBe(0);
    const near: LineString = { type: "LineString", coordinates: [[-55.91, -27.19], [-55.91, -27.22]] };
    const d = lineToAreaM(near, square);
    expect(d).toBeGreaterThan(980); // 0,01° de longitud ~ 990 m
    expect(d).toBeLessThan(1000);
    expect(lineToAreaM({ type: "LineString", coordinates: [] }, square)).toBe(Infinity);
  });
});
