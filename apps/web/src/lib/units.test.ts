import { beforeEach, describe, expect, it } from "vitest";
import { fmtHa, fmtMm, fmtTemp } from "./format";
import { CUADRA_HA, getUnits, resetUnitsCache, setUnits } from "./units";

describe("unidades", () => {
  beforeEach(() => {
    localStorage.clear();
    resetUnitsCache();
  });

  it("la cuadra paraguaya son 100 x 100 varas de 0,866 m (0,75 ha)", () => {
    expect(CUADRA_HA).toBe(0.75);
  });
  it("por defecto muestra ha, mm y °C", () => {
    expect(fmtHa(12.5)).toBe("12,5 ha");
    expect(fmtMm(30)).toBe("30 mm");
    expect(fmtTemp(25)).toBe("25 °C");
  });
  it("convierte según la preferencia y la recuerda", () => {
    setUnits({ area: "cuadra", rain: "in", temp: "f" });
    expect(fmtHa(75)).toBe("100 cuadras");
    expect(fmtMm(25.4)).toBe("1,00 pulg");
    expect(fmtTemp(100)).toBe("212 °F");
    resetUnitsCache();
    expect(getUnits().area).toBe("cuadra");
  });
  it("datos corruptos vuelven a los valores por defecto", () => {
    localStorage.setItem("yvy.units.anon", "{x");
    expect(getUnits()).toEqual({ area: "ha", rain: "mm", temp: "c" });
  });
});
