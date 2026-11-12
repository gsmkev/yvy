// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { samplingGrid, type Area } from "@yvy/geo";
import { projector, plotPath, SamplingReport } from "./samplingPdf";
import { toCsv } from "./tableExport";
import type { Farm, Plot } from "./types";

const geometry = {
  type: "Polygon",
  coordinates: [[[-55.9, -27.2], [-55.88, -27.2], [-55.88, -27.205], [-55.895, -27.205], [-55.895, -27.22], [-55.9, -27.22], [-55.9, -27.2]]],
};
const plot = { id: "p", name: "Lote en L", areaHa: 120, geometry: JSON.stringify(geometry), minLon: -55.9, minLat: -27.22, maxLon: -55.88, maxLat: -27.2 } as unknown as Plot;
const farm = { id: "f", name: "La Esperanza", areaHa: 500 } as unknown as Farm;

describe("grilla de muestreo (M-18)", () => {
  it("el croquis proyecta los puntos dentro del lienzo", () => {
    const { px, py } = projector(plot, 320, 220);
    const pts = samplingGrid(geometry as Area, 5);
    expect(pts.length).toBeGreaterThan(5);
    for (const p of pts) {
      expect(px(p.lon)).toBeGreaterThanOrEqual(0);
      expect(px(p.lon)).toBeLessThanOrEqual(320);
      expect(py(p.lat)).toBeGreaterThanOrEqual(0);
      expect(py(p.lat)).toBeLessThanOrEqual(220);
    }
    expect(plotPath(plot, px, py)).toMatch(/^M.*Z$/);
  });

  it("genera el PDF imprimible con la tabla de coordenadas y el CSV numerado", async () => {
    const pts = samplingGrid(geometry as Area, 10);
    const buf = await renderToBuffer(<SamplingReport farm={farm} plot={plot} haPerPoint={10} points={pts} generatedAt={Date.now()} />);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    const csv = toCsv({ name: "m", headers: ["Punto", "Latitud", "Longitud"], rows: pts.map((p) => [p.n, p.lat, p.lon]) });
    expect(csv.split("\r\n")).toHaveLength(pts.length + 1);
    expect(csv.split("\r\n")[1]).toMatch(/^1,-27\./);
  });
});
