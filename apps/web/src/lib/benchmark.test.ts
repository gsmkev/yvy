import { describe, expect, it } from "vitest";
import { tk } from "./i18n";
import { compareToZone, zoneVerdictKey } from "./benchmark";

describe("comparación con la zona", () => {
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
  it("cada frase de la comparación existe en es-PY y se muestra", () => {
    for (const m of ["vigor", "rain"] as const)
      for (const v of ["above", "below", "same"] as const) {
        const key = zoneVerdictKey(m, v);
        expect(tk(key), key).not.toMatch(/undefined|^ui\./);
        expect(tk(key).length).toBeGreaterThan(10);
      }
  });
});
