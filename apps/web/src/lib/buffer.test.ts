import { describe, expect, it } from "vitest";
import type { LineString, Polygon } from "geojson";
import { bufferAnalysis, cleanDistances, DEFAULT_DISTANCES } from "./buffer";

const poly = (lon: number, lat: number, size = 0.01): Polygon => ({
  type: "Polygon",
  coordinates: [[[lon, lat], [lon + size, lat], [lon + size, lat - size], [lon, lat - size], [lon, lat]]],
});
const plots = [
  { id: "a", name: "A", geometry: JSON.stringify(poly(-55.9, -27.2)) },
  { id: "b", name: "B", geometry: JSON.stringify(poly(-55.8, -27.2)) },
];
// ~55 m al norte del borde norte del lote A
const house = { kind: "house", name: "Casa del puesto", lon: -55.895, lat: -27.1995 };
const stream: LineString = { type: "LineString", coordinates: [[-55.789, -27.19], [-55.789, -27.22]] }; // ~99 m al este de B
const features = { points: [house, { kind: "gate", name: "Tranquera", lon: -55.895, lat: -27.1995 }], streams: [{ name: "Arroyo Pytã", geometry: stream }] };

describe("zonas de amortiguación (A-15)", () => {
  it("marca los lotes con una casa o un curso de agua dentro de la distancia, ignorando otros puntos", () => {
    const r = bufferAnalysis(plots, features, [], { ...DEFAULT_DISTANCES, stream: 150 });
    expect(r.plots.map((p) => p.plotId).sort()).toEqual(["a", "b"]);
    const a = r.plots.find((p) => p.plotId === "a")!;
    expect(a.hits).toHaveLength(1);
    expect(a.hits[0]).toMatchObject({ kind: "house", name: "Casa del puesto", limitM: 100 });
    expect(a.hits[0]!.distanceM).toBeGreaterThan(45);
    expect(a.hits[0]!.distanceM).toBeLessThan(65);
    expect(r.plots.find((p) => p.plotId === "b")!.hits[0]).toMatchObject({ kind: "stream", name: "Arroyo Pytã" });
  });

  it("con una distancia menor el lote sale de la zona", () => {
    const r = bufferAnalysis(plots, features, [], { house: 20, school: 20, water: 20, stream: 20 });
    expect(r.plots).toEqual([]);
  });

  it("una aplicación con GPS se juzga por su punto y sin GPS por el lote", () => {
    const apps = [
      { id: "far", plotId: "a", plotName: "A", capturedAt: 1, lon: -55.895, lat: -27.205, gpsAccuracyM: 5 }, // lejos de la casa
      { id: "near", plotId: "a", plotName: "A", capturedAt: 2, lon: -55.895, lat: -27.2, gpsAccuracyM: 5 }, // ~55 m
      { id: "nogps", plotId: "a", plotName: "A", capturedAt: 3, lon: null, lat: null, gpsAccuracyM: null },
      { id: "other", plotId: "zzz", plotName: null, capturedAt: 4, lon: null, lat: null, gpsAccuracyM: null },
    ];
    const r = bufferAnalysis(plots, features, apps, DEFAULT_DISTANCES);
    expect(r.alerts.map((x) => [x.recordId, x.basis])).toEqual([
      ["nogps", "plot"],
      ["near", "gps"],
    ]);
  });

  it("las distancias inválidas vuelven al valor de referencia", () => {
    expect(cleanDistances({ house: "250", school: "", water: -5, stream: "abc" })).toEqual({ ...DEFAULT_DISTANCES, house: 250 });
    expect(cleanDistances({ house: 99_999 }).house).toBe(DEFAULT_DISTANCES.house);
    expect(cleanDistances(null)).toEqual(DEFAULT_DISTANCES);
  });
});
