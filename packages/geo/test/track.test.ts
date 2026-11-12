import { describe, expect, it } from "vitest";
import { trackLengthM, simplifyLine, simplifyToMax, type LonLat } from "../src/track";

const M = 1 / 111_320; // grados de latitud por metro

describe("simplifyLine (Douglas-Peucker)", () => {
  it("quita puntos alineados y conserva los extremos", () => {
    const line: LonLat[] = Array.from({ length: 50 }, (_, i) => [-55, -26 + i * 10 * M]);
    const out = simplifyLine(line, 2);
    expect(out).toEqual([line[0], line[49]]);
  });

  it("conserva una esquina marcada", () => {
    const line: LonLat[] = [
      [-55, -26],
      [-55, -26 + 100 * M],
      [-55 + 100 * M * 1.1, -26 + 100 * M],
    ];
    expect(simplifyLine(line, 5)).toHaveLength(3);
  });

  it("descarta desvíos menores a la tolerancia", () => {
    const line: LonLat[] = [
      [-55, -26],
      [-55 + 1 * M, -26 + 50 * M],
      [-55, -26 + 100 * M],
    ];
    expect(simplifyLine(line, 3)).toHaveLength(2);
    expect(simplifyLine(line, 0.5)).toHaveLength(3);
  });

  it("no modifica la entrada y acepta casos chicos", () => {
    const line: LonLat[] = [[-55, -26]];
    expect(simplifyLine(line, 5)).toEqual(line);
    expect(simplifyLine([], 5)).toEqual([]);
  });

  it("aguanta 20 mil puntos sin desbordar la pila", () => {
    const line: LonLat[] = Array.from({ length: 20_000 }, (_, i) => [-55 + Math.sin(i / 50) * 30 * M, -26 + i * M]);
    expect(simplifyLine(line, 1).length).toBeGreaterThan(2);
  });
});

describe("trackLengthM", () => {
  it("mide ~100 m en 100 m de latitud", () => {
    expect(trackLengthM([[-55, -26], [-55, -26 + 100 * M]])).toBeGreaterThan(99);
    expect(trackLengthM([[-55, -26], [-55, -26 + 100 * M]])).toBeLessThan(101);
  });
  it("es 0 con menos de dos puntos", () => {
    expect(trackLengthM([[-55, -26]])).toBe(0);
  });
});

describe("simplifyToMax", () => {
  it("respeta el tope de puntos", () => {
    const line: LonLat[] = Array.from({ length: 3000 }, (_, i) => [-55 + Math.sin(i / 20) * 50 * M, -26 + i * 2 * M]);
    const out = simplifyToMax(line, 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out[0]).toEqual(line[0]);
    expect(out[out.length - 1]).toEqual(line[2999]);
  });
});
