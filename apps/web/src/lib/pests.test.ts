import { describe, expect, it } from "vitest";
import { BRAND } from "@yvy/shared";
import { pestCounts, pestPoints, PEST_COLORS } from "./pests";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const DAY = 86_400_000;
const square = JSON.stringify({
  type: "Polygon",
  coordinates: [
    [
      [-55, -27],
      [-54.8, -27],
      [-54.8, -27.2],
      [-55, -27.2],
      [-55, -27],
    ],
  ],
});
const rec = (over: Record<string, unknown>) => ({
  id: String(Math.random()),
  kind: "pest",
  data: { pest: "chinche", intensity: "high" },
  lon: null as number | null,
  lat: null as number | null,
  plotId: null as string | null,
  capturedAt: NOW - DAY,
  ...over,
});

describe("focos de plaga", () => {
  it("usa el GPS del registro y, si no hay, el centro del lote", () => {
    const pts = pestPoints(
      [rec({ id: "a", lon: -55.1, lat: -27.1 }), rec({ id: "b", plotId: "p1" }), rec({ id: "c" })],
      [{ id: "p1", geometry: square }],
      NOW,
    );
    expect(pts.map((p) => p.id)).toEqual(["a", "b"]);
    expect(pts[0]).toMatchObject({ lon: -55.1, lat: -27.1 });
    expect(pts[1]!.lon).toBeCloseTo(-54.9, 3);
    expect(pts[1]!.lat).toBeCloseTo(-27.1, 3);
  });

  it("solo los últimos 30 días y solo plagas", () => {
    const pts = pestPoints(
      [
        rec({ id: "new", lon: 1, lat: 1, capturedAt: NOW - 29 * DAY }),
        rec({ id: "old", lon: 1, lat: 1, capturedAt: NOW - 31 * DAY }),
        rec({ id: "rain", kind: "rain", data: { mm: 3 }, lon: 1, lat: 1 }),
      ],
      [],
      NOW,
    );
    expect(pts.map((p) => p.id)).toEqual(["new"]);
  });

  it("colorea por plaga con la paleta de marca", () => {
    const pts = pestPoints(
      [
        rec({ id: "1", lon: 1, lat: 1 }),
        rec({ id: "2", lon: 1, lat: 1, data: { pest: "roya", intensity: "low" } }),
        rec({ id: "3", lon: 1, lat: 1, data: { pest: "chinche", perMeter: 4 } }),
      ],
      [],
      NOW,
    );
    expect(pts.map((p) => p.color)).toEqual([BRAND.alerta, BRAND.cielo, BRAND.alerta]);
    expect(PEST_COLORS.malezas).toBe(BRAND.soja);
    expect(pestCounts(pts)).toEqual([
      { pest: "chinche", n: 2 },
      { pest: "roya", n: 1 },
    ]);
  });
});
