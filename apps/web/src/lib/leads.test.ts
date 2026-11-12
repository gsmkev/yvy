import { describe, expect, it } from "vitest";
import { inParaguay, parseCoords } from "./leads";

describe("coordenadas del informe gratis (V-04)", () => {
  it("entiende punto o coma decimal y los separadores habituales", () => {
    expect(parseCoords("-27.3, -55.9")).toEqual({ lat: -27.3, lon: -55.9 });
    expect(parseCoords("-27,3 -55,9")).toEqual({ lat: -27.3, lon: -55.9 });
    expect(parseCoords("-27,3,-55,9")).toEqual({ lat: -27.3, lon: -55.9 });
    expect(parseCoords(" -27.3;-55.9 ")).toEqual({ lat: -27.3, lon: -55.9 });
  });
  it("rechaza lo que no son dos números en grados", () => {
    expect(parseCoords("")).toBeNull();
    expect(parseCoords("Encarnación")).toBeNull();
    expect(parseCoords("-27.3")).toBeNull();
    expect(parseCoords("-127.3, -55.9")).toBeNull();
  });
  it("solo acepta puntos dentro de Paraguay", () => {
    expect(inParaguay({ lat: -27.3, lon: -55.9 })).toBe(true);
    expect(inParaguay({ lat: -34.6, lon: -58.4 })).toBe(false);
  });
});
