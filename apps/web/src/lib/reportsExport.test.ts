// @vitest-environment node
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { buildExportZip, plotsToGeoJson, type ExportData } from "./reportsExport";
import type { Member, Plot, RecordRow, Task } from "./types";

const geometry = JSON.stringify({
  type: "Polygon",
  coordinates: [
    [
      [-55.9, -27.2],
      [-55.89, -27.2],
      [-55.89, -27.21],
      [-55.9, -27.2],
    ],
  ],
});
const plot = {
  id: "p1",
  farmId: "f1",
  name: "Lote Norte",
  kind: "crop",
  geometry,
  areaHa: 42.123,
  crop: "soja",
  season: "zafra",
  sowingDate: "2026-10-01",
} as unknown as Plot;
const record = {
  id: "r1",
  kind: "rain",
  data: { mm: 12, readAt: 0 },
  plotName: "Lote Norte",
  authorName: "Ramón",
  lat: -27.2,
  lon: -55.9,
  capturedAt: Date.parse("2026-11-01T12:00:00Z"),
  attachments: [{ id: "a1", uploadStatus: "uploaded" }],
} as unknown as RecordRow;
const task = {
  title: "Revisar alambrado",
  plotName: null,
  assigneeName: "Ramón",
  dueDate: "2026-11-12",
  status: "open",
  recurrence: "none",
} as unknown as Task;
const member = { fullName: "Ana", email: "ana@x.py", phone: null, role: "admin", status: "active" } as unknown as Member;

const data: ExportData = {
  orgName: "Estancia Test",
  farms: [{ farm: { id: "f1", name: "La Esperanza" }, plots: [plot], records: [record], tasks: [task] }],
  members: [member],
  photos: [{ recordId: "r1", farm: "La Esperanza", capturedAt: record.capturedAt, attachmentId: "a1", url: "https://r2/a1?sig=1" }],
  truncated: [],
  generatedAt: Date.now(),
};

describe("exportación completa", () => {
  it("GeoJSON con propiedades de cada lote", () => {
    const fc = plotsToGeoJson(data.farms);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties).toMatchObject({ estancia: "La Esperanza", lote: "Lote Norte", superficie_ha: 42.12 });
  });

  it("el ZIP trae Excel con las cinco hojas, KML, GeoJSON y LEEME", async () => {
    const blob = await buildExportZip(data);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(
      ["LEEME.txt", "kml/", "kml/La_Esperanza.kml", "lotes.geojson", "yvy-exportacion.xlsx"].sort(),
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await zip.file("yvy-exportacion.xlsx")!.async("arraybuffer"));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Lotes", "Registros", "Tareas", "Miembros", "Fotos"]);
    expect(wb.getWorksheet("Lotes")!.getRow(2).getCell(2).value).toBe("Lote Norte");
    expect(wb.getWorksheet("Fotos")!.getRow(2).getCell(5).value).toBe("https://r2/a1?sig=1");
    expect(wb.getWorksheet("Miembros")!.rowCount).toBe(2);
    expect(await zip.file("kml/La_Esperanza.kml")!.async("string")).toContain("<name>Lote Norte</name>");
    expect(await zip.file("LEEME.txt")!.async("string")).toContain("no se incluyen");
  });
});
