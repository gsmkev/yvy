import { describe, expect, it } from "vitest";
import { compareToZone } from "./benchmark";

describe("comparación con la zona (R-08)", () => {
  it("compara contra la mediana con una banda de 10 %", () => {
    expect(compareToZone(0.7, 0.6)).toBe("above");
    expect(compareToZone(0.5, 0.6)).toBe("below");
    expect(compareToZone(0.62, 0.6)).toBe("same");
    expect(compareToZone(0, 0)).toBe("same");
  });
  it("sin alguno de los dos datos no compara", () => {
    expect(compareToZone(null, 0.6)).toBeNull();
    expect(compareToZone(0.6, null)).toBeNull();
  });
});
