import { describe, expect, it } from "vitest";
import { analysisAreas, burnedEvents, coverKeys, parseCoverKey, summarizeCover } from "./changesData";
import type { AnalysisPlot, BurnedMetrics, CoverMetrics } from "./types";

const base = { fromAt: 1, toAt: 2, validPct: 95, changes: '{"type":"FeatureCollection","features":[]}', computedAt: 3 };
const burn = (plotId: string, refKey: string, burnedHa: number, validPct = 95): AnalysisPlot<BurnedMetrics> => ({
  ...base,
  plotId,
  plotName: `Lote ${plotId}`,
  refKey,
  plotAreaHa: 50,
  validPct,
  metrics: { eventAt: Date.parse(refKey), burnedHa, highHa: burnedHa / 2, hotspots: 2 },
});

describe("cambios en el terreno", () => {
  it("agrupa los quemados por incendio, el más reciente primero, y separa los lotes sin quemado", () => {
    const ev = burnedEvents([
      burn("a", "2026-08-10", 4),
      burn("b", "2026-08-10", 10),
      burn("c", "2026-08-10", 0),
      burn("d", "2026-08-10", 0, 20),
      burn("e", "2026-03-01", 1.234),
    ]);
    expect(ev.map((e) => e.refKey)).toEqual(["2026-08-10", "2026-03-01"]);
    expect(ev[0]).toMatchObject({ burnedHa: 14, highHa: 7, unaffected: 1, noData: 1 });
    expect(ev[0]!.plots.map((p) => p.plotId)).toEqual(["b", "a"]);
    expect(ev[1]!.burnedHa).toBe(1.23);
  });

  it("junta los polígonos para el mapa e ignora JSON roto", () => {
    const fc = (n: number) => JSON.stringify({ type: "FeatureCollection", features: Array.from({ length: n }, () => ({ geometry: { type: "Polygon", coordinates: [] } })) });
    const areas = analysisAreas([
      { plotId: "a", changes: fc(2) },
      { plotId: "b", changes: "no es json" },
    ]);
    expect(areas.map((a) => a.id)).toEqual(["a-0", "a-1"]);
  });

  it("suma el cambio de cobertura de la estancia", () => {
    const cls = (forest: number, pasture: number, crop: number, other: number) => ({ forest, pasture, crop, other });
    const p = (from: CoverMetrics["from"], to: CoverMetrics["to"], f2p: number, f2c: number): AnalysisPlot<CoverMetrics> => ({
      ...base,
      plotId: "x",
      plotName: "X",
      refKey: "2020-12-31_2026-10-31",
      plotAreaHa: 100,
      metrics: { from, to, forestToPasture: f2p, forestToCrop: f2c, forestToOther: 0 },
    });
    const s = summarizeCover([p(cls(40, 50, 10, 0), cls(30, 55, 15, 0), 6, 4), p(cls(10, 80, 10, 0), cls(10, 80, 10, 0), 0, 0)]);
    expect(s.from).toEqual(cls(50, 130, 20, 0));
    expect(s.to.forest).toBe(40);
    expect(s).toMatchObject({ forestToPasture: 6, forestToCrop: 4, forestLostHa: 10 });
    expect(s.fromAt).toBe(1);
    expect(s.toAt).toBe(2);
  });

  it("lee la referencia de un cambio de cobertura", () => {
    expect(parseCoverKey("2020-12-31_2026-10-31")).toEqual({ from: "2020-12-31", to: "2026-10-31" });
    expect(parseCoverKey("2026-08-10")).toBeNull();
    expect(coverKeys([{ refKey: "2019-01-01_2020-01-01" }, { refKey: "2020-12-31_2026-10-31" }, { refKey: "2019-01-01_2020-01-01" }])).toEqual([
      "2020-12-31_2026-10-31",
      "2019-01-01_2020-01-01",
    ]);
  });
});
