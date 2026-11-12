import { describe, expect, it } from "vitest";
import { densify, heatPoints, summarizeTracks, trackLine, TRACK_WINDOW_MS } from "./trackHeat";

const M = 1 / 111_320;
const NOW = 1_800_000_000_000;
const row = (id: string, plotId: string | null, over: Record<string, unknown> = {}, capturedAt = NOW - 1000) => ({
  id,
  kind: "track",
  plotId,
  capturedAt,
  data: { line: [[-55, -26], [-55, -26 + 100 * M]], distanceM: 100, ...over },
});

describe("recorridas en el mapa de calor (F-06)", () => {
  it("lee la línea y descarta datos rotos", () => {
    expect(trackLine(row("a", null))).toHaveLength(2);
    expect(trackLine({ kind: "track", data: { line: [[1, 2]] } })).toBeNull();
    expect(trackLine({ kind: "rain", data: { line: [[1, 2], [3, 4]] } })).toBeNull();
    expect(trackLine({ kind: "track", data: {} })).toBeNull();
  });

  it("densifica tramos largos cada ~8 m", () => {
    const pts = densify([[-55, -26], [-55, -26 + 100 * M]], 8);
    expect(pts.length).toBeGreaterThanOrEqual(13);
    expect(pts[0]).toEqual([-55, -26]);
  });

  it("ignora recorridas fuera de los 30 días y respeta el tope de puntos", () => {
    const old = row("old", null, {}, NOW - TRACK_WINDOW_MS - 1);
    expect(heatPoints([old], NOW)).toHaveLength(0);
    expect(heatPoints([row("a", null), row("b", null)], NOW, 5)).toHaveLength(5);
  });

  it("resume por lote y señala los lotes sin recorrer", () => {
    const s = summarizeTracks([row("a", "p1"), row("b", "p1", { distanceM: 900 }), row("c", null)], ["p1", "p2"], NOW);
    expect(s.walks).toBe(3);
    expect(s.km).toBeCloseTo(1.1, 5);
    expect(s.byPlot.get("p1")).toBe(2);
    expect(s.unvisited).toEqual(["p2"]);
  });
});
