import { describe, expect, it } from "vitest";
import { closedAreaHa, fmtDistance, pathLengthM, type LonLat } from "./measure";

// Un cuadrado de ~1 km de lado cerca de Asunción.
const dLat = 1000 / 111_195;
const dLon = dLat / Math.cos((-25 * Math.PI) / 180);
const sq: LonLat[] = [
  [-57, -25],
  [-57 + dLon, -25],
  [-57 + dLon, -25 + dLat],
  [-57, -25 + dLat],
];

describe("medición", () => {
  it("suma tramos y el perímetro al cerrar", () => {
    expect(pathLengthM(sq.slice(0, 2))).toBeGreaterThan(995);
    expect(pathLengthM(sq.slice(0, 2))).toBeLessThan(1005);
    expect(pathLengthM(sq, true)).toBeGreaterThan(3980);
    expect(pathLengthM(sq, true)).toBeLessThan(4020);
  });
  it("área de 1 km² = 100 ha; con menos de 3 puntos no hay área", () => {
    expect(closedAreaHa(sq)).toBeGreaterThan(98);
    expect(closedAreaHa(sq)).toBeLessThan(102);
    expect(closedAreaHa(sq.slice(0, 2))).toBeNull();
  });
  it("formatea metros y kilómetros", () => {
    expect(fmtDistance(850.4)).toBe("850 m");
    expect(fmtDistance(1250)).toBe("1,25 km");
  });
});
