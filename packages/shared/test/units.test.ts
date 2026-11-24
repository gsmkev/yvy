import { describe, expect, it } from "vitest";
import { areaLabel, cToTemp, haToArea, mmToRain, parseUnits } from "../src/units";

describe("unidades", () => {
  it("convierte para mostrar", () => {
    expect(haToArea(1.5, "cuadra")).toBe(2);
    expect(haToArea(1.5, "ha")).toBe(1.5);
    expect(mmToRain(25.4, "in")).toBeCloseTo(1);
    expect(cToTemp(100, "f")).toBe(212);
    expect(areaLabel("cuadra")).toBe("cuadras");
  });
  it("lo guardado corrupto vuelve a los valores por defecto", () => {
    expect(parseUnits("no json")).toEqual({ area: "ha", rain: "mm", temp: "c" });
    expect(parseUnits('{"area":"cuadra","rain":"xx"}')).toEqual({ area: "cuadra", rain: "mm", temp: "c" });
  });
});
