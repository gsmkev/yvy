/** Exportaciones generadas en el navegador (anexo §4.9): Excel de registros (RF-82) y KML de lotes (RF-15). */
import { describeRecord } from "@yvy/shared";
import { tk } from "./i18n";
import { fmtDateTime } from "./format";
import type { Plot, RecordRow } from "./types";

export function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export const describeData = (kind: string, d: Record<string, unknown>): string => describeRecord(kind, d);

export async function recordsToExcel(rows: RecordRow[], filename: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Registros");
  ws.columns = [
    { header: "Fecha", key: "date", width: 18 },
    { header: "Tipo", key: "kind", width: 20 },
    { header: "Lote", key: "plot", width: 20 },
    { header: "Empleado", key: "author", width: 22 },
    { header: "Observación", key: "obs", width: 50 },
    { header: "Latitud", key: "lat", width: 12 },
    { header: "Longitud", key: "lon", width: 12 },
    { header: "Fotos", key: "photos", width: 8 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow({
      date: fmtDateTime(r.capturedAt),
      kind: tk(`recordKinds.${r.kind}`),
      plot: r.plotName ?? "",
      author: r.authorName ?? "",
      obs: describeData(r.kind, r.data),
      lat: r.lat,
      lon: r.lon,
      photos: r.attachments.length,
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

const esc = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export function plotsToKml(plots: Plot[], farmName: string): string {
  const ring = (r: number[][]) =>
    `<LinearRing><coordinates>${r.map((p) => `${p[0]},${p[1]}`).join(" ")}</coordinates></LinearRing>`;
  const poly = (rings: number[][][]) =>
    `<Polygon><outerBoundaryIs>${ring(rings[0]!)}</outerBoundaryIs>${rings
      .slice(1)
      .map((r) => `<innerBoundaryIs>${ring(r)}</innerBoundaryIs>`)
      .join("")}</Polygon>`;
  const placemarks = plots.map((p) => {
    const g = JSON.parse(p.geometry) as { type: string; coordinates: number[][][] | number[][][][] };
    const geom =
      g.type === "Polygon"
        ? poly(g.coordinates as number[][][])
        : `<MultiGeometry>${(g.coordinates as number[][][][]).map(poly).join("")}</MultiGeometry>`;
    return `<Placemark><name>${esc(p.name)}</name><ExtendedData><Data name="superficie_ha"><value>${p.areaHa.toFixed(2)}</value></Data><Data name="tipo"><value>${p.kind}</value></Data>${p.crop ? `<Data name="cultivo"><value>${p.crop}</value></Data>` : ""}</ExtendedData>${geom}</Placemark>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(farmName)}</name>${placemarks.join("")}</Document></kml>`;
}
