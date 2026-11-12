// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { SeasonReport } from "./reportsPdf";
import type { Farm, Plot, RecordRow } from "./types";

const farm = {
  id: "f",
  name: "La Esperanza",
  department: "Itapúa",
  district: null,
  areaHa: 100,
  minLon: -55.9,
  minLat: -27.3,
  maxLon: -55.8,
  maxLat: -27.2,
} as unknown as Farm;
const plot = {
  id: "p",
  farmId: "f",
  name: "Lote 1",
  kind: "crop",
  geometry: "{}",
  areaHa: 40,
  crop: "soja",
  season: "zafra",
  sowingDate: "2026-10-01",
} as unknown as Plot;
const record = {
  id: "r",
  kind: "rain",
  data: { mm: 12, readAt: 0 },
  capturedAt: Date.parse("2026-11-01T12:00:00Z"),
  attachments: [],
} as unknown as RecordRow;

describe("PDF de resumen de campaña", () => {
  it("se genera con datos y sin datos", async () => {
    const full = await renderToBuffer(
      <SeasonReport
        farm={farm}
        plot={plot}
        from="2026-10-01"
        to="2026-11-10"
        records={[record]}
        rainMm={120}
        normalMm={140}
        gaugeMm={null}
        ndvi={[{ acquiredAt: Date.parse("2026-11-01"), mean: 0.62, p10: 0.5, p90: 0.7, validPct: 99 }]}
      />,
    );
    expect(full.subarray(0, 4).toString()).toBe("%PDF");
    const empty = await renderToBuffer(
      <SeasonReport farm={farm} plot={plot} from="a" to="b" records={[]} rainMm={null} normalMm={null} gaugeMm={null} ndvi={[]} />,
    );
    expect(empty.length).toBeGreaterThan(500);
  });
});
