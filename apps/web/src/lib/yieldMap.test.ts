import { describe, expect, it } from "vitest";
import type { FeatureCollection, Polygon } from "geojson";
import { extractPoints, MAX_CELLS, numericFields, summarizeYield, toTHa } from "./yieldMap";

const plot: Polygon = {
  type: "Polygon",
  coordinates: [[[-55.9, -27.2], [-55.89, -27.2], [-55.89, -27.21], [-55.9, -27.21], [-55.9, -27.2]]],
};
const pt = (lon: number, lat: number, props: Record<string, unknown>) => ({
  type: "Feature" as const,
  properties: props,
  geometry: { type: "Point" as const, coordinates: [lon, lat] },
});
const fc = (features: ReturnType<typeof pt>[]): FeatureCollection => ({ type: "FeatureCollection", features });

describe("mapas de rendimiento (A-21)", () => {
  it("propone primero el campo que parece rendimiento", () => {
    const f = fc([pt(-55.895, -27.205, { Elevation: 120, Speed: 6.1, Yld_Vol_Dr: 55.2, Name: "x" })]);
    expect(numericFields(f)[0]).toBe("Yld_Vol_Dr");
    expect(numericFields(f)).toEqual(expect.arrayContaining(["Elevation", "Speed"]));
  });

  it("convierte unidades a t/ha", () => {
    expect(toTHa(3.2, "t_ha", "soja")).toBe(3.2);
    expect(toTHa(3200, "kg_ha", "soja")).toBe(3.2);
    expect(toTHa(50, "bu_ac", "soja")).toBeCloseTo(3.36, 2);
    expect(toTHa(100, "bu_ac", "maiz")).toBeCloseTo(6.28, 2);
  });

  it("toma puntos y centroides de polígonos, y salta los valores que no son número", () => {
    const polygon = { type: "Feature" as const, properties: { y: 4 }, geometry: { type: "Polygon" as const, coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] } };
    const pts = extractPoints({ type: "FeatureCollection", features: [pt(1, 1, { y: 3 }), pt(1, 1, { y: "n/d" }), polygon] }, "y");
    expect(pts).toHaveLength(2);
    expect(pts[1]).toMatchObject({ lon: 1, lat: 1, v: 4 });
  });

  it("descarta lo de afuera del lote, los ceros y los atípicos, y resume en celdas", () => {
    const points = [];
    for (let i = 0; i < 100; i++) points.push({ lon: -55.899 + (i % 10) * 0.0008, lat: -27.201 - Math.floor(i / 10) * 0.0008, v: 3000 + (i % 7) * 50 });
    points.push({ lon: -55.895, lat: -27.205, v: 0 }); // cero
    points.push({ lon: -55.895, lat: -27.205, v: 40_000 }); // atípico
    points.push({ lon: -56, lat: -27.205, v: 3000 }); // fuera del lote
    const s = summarizeYield(points, "kg_ha", "soja", plot)!;
    expect(s.nPoints).toBe(100);
    expect(s.nDropped).toBe(3);
    expect(s.meanTHa).toBeGreaterThan(3.1);
    expect(s.meanTHa).toBeLessThan(3.3);
    expect(s.p10THa).toBeLessThanOrEqual(s.meanTHa);
    expect(s.p90THa).toBeGreaterThanOrEqual(s.meanTHa);
    expect(s.cells.length).toBeGreaterThan(1);
    expect(s.cells.reduce((a, c) => a + c[3], 0)).toBe(100);
  });

  it("la celda crece para no pasar del tope de celdas, y con pocos puntos no hay mapa", () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({
      lon: -55.8995 + (i % 100) * 0.0001,
      lat: -27.2005 - Math.floor(i / 100) * 0.0001,
      v: 3 + (i % 5) * 0.1,
    }));
    const s = summarizeYield(many, "t_ha", "soja", plot, 1)!;
    expect(s.cells.length).toBeLessThanOrEqual(MAX_CELLS);
    expect(s.cellM).toBeGreaterThan(1);
    expect(summarizeYield([{ lon: -55.895, lat: -27.205, v: 3 }], "t_ha", "soja", plot)).toBeNull();
  });
});
