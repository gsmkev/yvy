import { describe, expect, it } from "vitest";
import { activeFilterCount, areaByCrop, decimalCoords, degMinCoords, deltaVsFarm, filterRecords, matchesQuery, NO_RECORD_FILTER, sortPlotLines, unvisitedOver, type PlotLine } from "../src/lib/plotInfo";

const line = (p: Partial<PlotLine>): PlotLine => ({ id: "x", name: "A", farmId: "f", kind: "crop", crop: "soja", areaHa: 10, vigor: null, visitDays: 0, ...p });

describe("plotInfo", () => {
  it("coordenadas decimal y grados-minutos", () => {
    expect(decimalCoords(-57.6345, -25.2812)).toBe("-25.28120, -57.63450");
    expect(degMinCoords(-57.5, -25.25)).toBe("25°15.000′ S, 57°30.000′ O");
  });
  it("comparación con la estancia", () => {
    expect(deltaVsFarm(0.6, [0.5])).toBeNull();
    expect(deltaVsFarm(0.6, [0.5, 0.7])).toBeCloseTo(0);
  });
  it("orden, filtro de visitas y resumen por cultivo", () => {
    const rows = [line({ id: "1", name: "B", vigor: 0.7, visitDays: 3, areaHa: 5 }), line({ id: "2", name: "A", vigor: 0.4, visitDays: 20, areaHa: 50 }), line({ id: "3", name: "C", visitDays: null, kind: "pasture", crop: null })];
    expect(sortPlotLines(rows, "name").map((r) => r.id)).toEqual(["2", "1", "3"]);
    expect(sortPlotLines(rows, "area").map((r) => r.id)).toEqual(["2", "3", "1"]);
    expect(sortPlotLines(rows, "vigor").map((r) => r.id)).toEqual(["2", "1", "3"]);
    expect(sortPlotLines(rows, "visit").map((r) => r.id)).toEqual(["3", "2", "1"]);
    expect(unvisitedOver(rows, 14).map((r) => r.id).sort()).toEqual(["2", "3"]);
    expect(areaByCrop(rows)[0]).toEqual({ key: "soja", ha: 55, plots: 2 });
  });
  it("filtra registros por estancia, autor y fechas", () => {
    const d = (iso: string) => Date.parse(`${iso}T12:00:00-03:00`);
    const rs = [{ farmId: "a", authorId: "u1", capturedAt: d("2026-11-10") }, { farmId: "b", authorId: "u2", capturedAt: d("2026-11-12") }];
    expect(filterRecords(rs, NO_RECORD_FILTER)).toHaveLength(2);
    expect(filterRecords(rs, { ...NO_RECORD_FILTER, farmId: "b" })).toHaveLength(1);
    expect(filterRecords(rs, { ...NO_RECORD_FILTER, authorId: "u1" })).toHaveLength(1);
    expect(filterRecords(rs, { ...NO_RECORD_FILTER, from: "2026-11-11", to: "2026-11-12" })).toHaveLength(1);
    expect(filterRecords(rs, { ...NO_RECORD_FILTER, to: "2026-11-10" })).toHaveLength(1);
    expect(activeFilterCount({ farmId: "a", authorId: "", from: "x", to: "" })).toBe(2);
  });
  it("buscador sin tildes ni mayúsculas, todas las palabras", () => {
    expect(matchesQuery("lote soja", "Lote del fondo", "Soja")).toBe(true);
    expect(matchesQuery("fondó", "Lote del fondo")).toBe(true);
    expect(matchesQuery("maiz", "Soja")).toBe(false);
    expect(matchesQuery("  ", "Soja")).toBe(false);
  });
});
