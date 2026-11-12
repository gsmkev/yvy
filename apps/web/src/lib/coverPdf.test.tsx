// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { CoverReport } from "./coverPdf";
import { t } from "./i18n";
import type { AnalysisPlot, CoverMetrics, Farm, Plot } from "./types";

const square = (lon: number, lat: number, d: number) => ({
  type: "Polygon",
  coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat - d], [lon, lat - d], [lon, lat]]],
});
const farm = {
  id: "f",
  name: "La Esperanza",
  department: "Itapúa",
  district: null,
  areaHa: 100,
  geometry: JSON.stringify(square(-55.9, -27.2, 0.02)),
  minLon: -55.9,
  minLat: -27.22,
  maxLon: -55.88,
  maxLat: -27.2,
} as unknown as Farm;
const plots = [{ id: "p1", name: "Lote 1", kind: "crop", geometry: JSON.stringify(square(-55.9, -27.2, 0.01)) }] as unknown as Plot[];
const row = (validPct = 95): AnalysisPlot<CoverMetrics> => ({
  plotId: "p1",
  plotName: "Lote 1",
  refKey: "2020-12-31_2026-10-31",
  fromAt: 1,
  toAt: 2,
  plotAreaHa: 100,
  validPct,
  metrics: { from: { forest: 60, pasture: 30, crop: 10, other: 0 }, to: { forest: 40, pasture: 45, crop: 15, other: 0 }, forestToPasture: 15, forestToCrop: 5, forestToOther: 0 },
  changes: JSON.stringify({ type: "FeatureCollection", features: [{ geometry: square(-55.895, -27.205, 0.002) }] }),
  computedAt: 3,
});

describe("PDF de cambio de cobertura", () => {
  it("se genera con datos y sin datos suficientes, y avisa que es indicativo", async () => {
    for (const r of [row(), row(20)]) {
      const buf = await renderToBuffer(<CoverReport farm={farm} plots={plots} rows={[r]} from="2020-12-31" to="2026-10-31" generatedAt={Date.now()} />);
      expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    }
    expect(t("ui.coverDisclaimer")).toMatch(/indicativo/);
    expect(t("ui.coverDisclaimer")).toMatch(/No es un peritaje ni una certificación/);
  });
});
