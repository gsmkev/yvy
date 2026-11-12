import { describe, expect, it } from "vitest";
import type { Polygon } from "geojson";
import { areaHa, containsPoint, filterFix, labelPoint, samplingCount, samplingGrid, simplifyTrace, traceToPolygon } from "../src";

const rect = (lon: number, lat: number, w: number, h: number): Polygon => ({
  type: "Polygon",
  coordinates: [[[lon, lat], [lon + w, lat], [lon + w, lat - h], [lon, lat - h], [lon, lat]]],
});
// Lote en L: el centro del bbox cae en el hueco
const L: Polygon = {
  type: "Polygon",
  coordinates: [[[-55.9, -27.2], [-55.88, -27.2], [-55.88, -27.205], [-55.895, -27.205], [-55.895, -27.22], [-55.9, -27.22], [-55.9, -27.2]]],
};

describe("M-12 · punto de etiqueta interior", () => {
  it("cae dentro del lote aunque sea en L o en U", () => {
    const p = labelPoint(L);
    expect(containsPoint(L, p.lon, p.lat)).toBe(true);
    // el centro del bbox está en el hueco de la L
    expect(containsPoint(L, -55.89, -27.21)).toBe(false);
    const u: Polygon = {
      type: "Polygon",
      coordinates: [[[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3], [0, 0]]],
    };
    const q = labelPoint(u);
    expect(containsPoint(u, q.lon, q.lat)).toBe(true);
  });
});

describe("M-18 · grilla de muestreo de suelo", () => {
  const plot = rect(-55.9, -27.2, 0.02, 0.02); // ~ 480 ha
  it("un punto cada 5 o 10 ha, numerados desde 1, todos adentro y sin repetir", () => {
    const ha = areaHa(plot);
    for (const per of [5, 10]) {
      const pts = samplingGrid(plot, per);
      expect(pts.map((p) => p.n)).toEqual(pts.map((_, i) => i + 1));
      expect(pts.every((p) => containsPoint(plot, p.lon, p.lat))).toBe(true);
      expect(pts.length).toBeGreaterThan((ha / per) * 0.8);
      expect(pts.length).toBeLessThan((ha / per) * 1.2);
      expect(new Set(pts.map((p) => `${p.lon},${p.lat}`)).size).toBe(pts.length);
    }
    expect(samplingGrid(plot, 5).length).toBeGreaterThan(samplingGrid(plot, 10).length);
    expect(samplingCount(plot, 10)).toBe(Math.round(ha / 10));
  });

  it("recorre en zigzag: el punto siguiente nunca queda lejos del anterior", () => {
    const pts = samplingGrid(plot, 10);
    const side = Math.sqrt(10 * 10_000);
    const m = (a: (typeof pts)[0], b: (typeof pts)[0]) => Math.hypot((a.lon - b.lon) * 98_000, (a.lat - b.lat) * 111_320);
    for (let i = 1; i < pts.length; i++) expect(m(pts[i - 1]!, pts[i]!)).toBeLessThan(side * 2.5);
  });

  it("respeta lotes en L (ningún punto en el hueco) y un lote chico lleva un punto", () => {
    expect(samplingGrid(L, 5).every((p) => containsPoint(L, p.lon, p.lat))).toBe(true);
    const tiny = rect(-55.9, -27.2, 0.001, 0.001); // ~1 ha
    const pts = samplingGrid(tiny, 10);
    expect(pts).toHaveLength(1);
    expect(containsPoint(tiny, pts[0]!.lon, pts[0]!.lat)).toBe(true);
    expect(() => samplingGrid(plot, 0)).toThrow();
  });
});

describe("M-04 · perímetro caminado", () => {
  // Cuadrado de ~100 m caminado con puntos cada ~10 m y algo de ruido
  const walk = () => {
    const pts: { lon: number; lat: number }[] = [];
    const d = 0.0009; // ~100 m
    const n = 10;
    const edge = (f: (t: number) => [number, number]) => {
      for (let i = 0; i < n; i++) pts.push({ lon: -55.9 + f(i / n)[0] + (i % 2) * 0.000002, lat: -27.2 + f(i / n)[1] });
    };
    edge((t) => [t * d, 0]);
    edge((t) => [d, -t * d]);
    edge((t) => [d - t * d, -d]);
    edge((t) => [0, -d + t * d]);
    return pts;
  };

  it("descarta fijos con mala precisión y los que casi no se movieron", () => {
    const a = { lon: -55.9, lat: -27.2, accuracy: 5 };
    expect(filterFix(undefined, a)).toBe(true);
    expect(filterFix(a, { lon: -55.9, lat: -27.2000001, accuracy: 5 })).toBe(false); // ~1 cm
    expect(filterFix(a, { lon: -55.9, lat: -27.2001, accuracy: 60 })).toBe(false); // impreciso
    expect(filterFix(a, { lon: -55.9, lat: -27.2001, accuracy: 6 })).toBe(true); // ~11 m
    expect(filterFix(a, { lon: -55.9, lat: -27.2001, accuracy: null })).toBe(true);
  });

  it("simplifica la traza a las esquinas y la cierra como polígono válido", () => {
    const pts = walk();
    const simple = simplifyTrace(pts, 3);
    expect(simple.length).toBeLessThan(pts.length / 3);
    const r = traceToPolygon(pts);
    expect("polygon" in r).toBe(true);
    if ("polygon" in r) {
      const ring = r.polygon.coordinates[0]!;
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      expect(r.ha).toBeGreaterThan(0.7);
      expect(r.ha).toBeLessThan(1.1);
    }
  });

  it("avisa si la traza es muy corta o se cruza a sí misma", () => {
    expect(traceToPolygon([{ lon: 0, lat: 0 }, { lon: 0.001, lat: 0 }])).toEqual({ error: "too_few_points" });
    // moño: los lados se cruzan
    const bow = [
      { lon: -55.9, lat: -27.2 },
      { lon: -55.899, lat: -27.201 },
      { lon: -55.899, lat: -27.2 },
      { lon: -55.9, lat: -27.201 },
    ];
    expect(traceToPolygon(bow, 1)).toEqual({ error: "self_intersection" });
  });
});
