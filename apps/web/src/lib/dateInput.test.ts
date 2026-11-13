import { describe, expect, it } from "vitest";
import { displayToIso, isoToDisplay, maskDate } from "./dateInput";

describe("fecha dd/mm/aaaa", () => {
  it("convierte de ISO a pantalla y de vuelta", () => {
    expect(isoToDisplay("2026-11-12")).toBe("12/11/2026");
    expect(isoToDisplay("")).toBe("");
    expect(displayToIso("12/11/2026")).toBe("2026-11-12");
  });
  it("rechaza días que no existen y años absurdos", () => {
    expect(displayToIso("31/02/2026")).toBeNull();
    expect(displayToIso("29/02/2024")).toBe("2024-02-29");
    expect(displayToIso("12/11/26")).toBeNull();
    expect(displayToIso("12/11/1800")).toBeNull();
  });
  it("pone las barras mientras se escribe", () => {
    expect(maskDate("1")).toBe("1");
    expect(maskDate("12")).toBe("12/");
    expect(maskDate("1211")).toBe("12/11/");
    expect(maskDate("12112026")).toBe("12/11/2026");
    expect(maskDate("12/11/20269")).toBe("12/11/2026");
  });
});
