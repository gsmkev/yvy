// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { EudrReport } from "./eudrPdf";
import { changeAreas, statusText, summarize } from "./eudrData";
import { t } from "./i18n";
import type { EudrPlot, EudrResponse, Farm, Plot } from "./types";

const square = (lon: number, lat: number, d: number) => ({
  type: "Polygon",
  coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat - d], [lon, lat - d], [lon, lat]]],
});

const farm = {
  id: "f",
  name: "La Esperanza",
  department: "Itapúa",
  district: "Capitán Meza",
  areaHa: 100,
  geometry: JSON.stringify(square(-55.9, -27.2, 0.02)),
  minLon: -55.9,
  minLat: -27.22,
  maxLon: -55.88,
  maxLat: -27.2,
} as unknown as Farm;
const plots = [{ id: "p1", name: "Lote 1", kind: "crop", geometry: JSON.stringify(square(-55.9, -27.2, 0.01)) }] as unknown as Plot[];

const plot = (over: Partial<EudrPlot> = {}): EudrPlot => ({
  plotId: "p1",
  plotName: "Lote 1",
  status: "possible_loss",
  plotAreaHa: 100,
  forestRefHa: 40,
  lossHa: 3.2,
  validPct: 98,
  refYear: 2020,
  curYear: 2026,
  refFromAt: 1_591_000_000_000,
  refToAt: 1_601_000_000_000,
  curFromAt: 1_780_000_000_000,
  curToAt: 1_790_000_000_000,
  refScenes: 12,
  curScenes: 14,
  changes: JSON.stringify({
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { areaHa: 3.2 }, geometry: square(-55.895, -27.205, 0.002) }],
  }),
  computedAt: 1_790_000_000_000,
  ...over,
});

describe("indicador EUDR", () => {
  it("resume lotes, hectáreas y fechas de los compuestos", () => {
    const d: EudrResponse = {
      computedAt: 1,
      plots: [
        plot(),
        plot({ plotId: "p2", status: "no_change", lossHa: 0, forestRefHa: 10, refFromAt: 1_590_000_000_000, changes: '{"type":"FeatureCollection","features":[]}' }),
        plot({ plotId: "p3", status: "no_data", lossHa: 0, forestRefHa: 0, changes: "{\"features\":[]}" }),
      ],
    };
    const sum = summarize(d);
    expect(sum).toMatchObject({ plots: 3, withLoss: 1, noData: 1, forestRefHa: 50, lossHa: 3.2, refYear: 2020, curYear: 2026, refFromAt: 1_590_000_000_000 });
    expect(changeAreas(d.plots)).toHaveLength(1);
    expect(changeAreas([plot({ changes: "no es json" })])).toEqual([]);
  });

  it("los textos de estado y el aviso dicen que es indicativo", () => {
    expect(statusText("no_change", 0)).toBe("Sin cambio");
    expect(statusText("possible_loss", 3.2)).toBe("Posible pérdida de bosque: 3,2 ha");
    expect(t("ui.eudrDisclaimer")).toMatch(/indicativo/);
    expect(t("ui.eudrDisclaimer")).toMatch(/No es una declaración de debida diligencia ni una certificación/);
  });

  it("PDF con pérdida, sin cambios y sin datos", async () => {
    const full = await renderToBuffer(
      <EudrReport farm={farm} plots={plots} generatedAt={Date.now()} data={{ computedAt: 1_790_000_000_000, plots: [plot()] }} />,
    );
    expect(full.subarray(0, 4).toString()).toBe("%PDF");
    const none = await renderToBuffer(
      <EudrReport
        farm={farm}
        plots={plots}
        generatedAt={Date.now()}
        data={{ computedAt: 1, plots: [plot({ status: "no_data", lossHa: 0, refFromAt: null, refToAt: null, changes: '{"features":[]}' })] }}
      />,
    );
    expect(none.length).toBeGreaterThan(500);
  });
});
