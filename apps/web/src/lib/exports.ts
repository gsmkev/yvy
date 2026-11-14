/** Exportaciones generadas en el navegador (anexo §4.9): Excel de registros (RF-82) y KML de lotes (RF-15). */
import { describeRecord } from "@yvy/shared";
import { tk } from "./i18n";
import { fmtDateTime } from "./format";
import type { TableData } from "./tableExport";
import type { Plot, RecordRow } from "./types";

export function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export const describeData = (kind: string, d: Record<string, unknown>): string => describeRecord(kind, d);

/** Los registros como tabla simple (para CSV). */
export function recordsTable(rows: RecordRow[]): TableData {
  return {
    name: "Registros",
    headers: ["Fecha", "Tipo", "Lote", "Empleado", "Observación", "Latitud", "Longitud", "Fotos"],
    rows: rows.map((r) => [
      fmtDateTime(r.capturedAt),
      tk(`recordKinds.${r.kind}`),
      r.plotName ?? "",
      r.authorName ?? "",
      describeData(r.kind, r.data),
      r.lat,
      r.lon,
      r.attachments.length,
    ]),
  };
}

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

// ---------------------------------------------------------------------------
// GeoJSON y shapefile (M-21)
// ---------------------------------------------------------------------------

export interface ExportPoint {
  name: string;
  kind: string;
  lon: number;
  lat: number;
}

export function plotsToGeoJson(plots: Plot[], points: ExportPoint[] = []): string {
  const features = [
    ...plots.map((p) => ({
      type: "Feature" as const,
      properties: { nombre: p.name, tipo: p.kind, cultivo: p.crop, superficie_ha: Math.round(p.areaHa * 100) / 100 },
      geometry: JSON.parse(p.geometry) as unknown,
    })),
    ...points.map((p) => ({
      type: "Feature" as const,
      properties: { nombre: p.name, tipo: p.kind },
      geometry: { type: "Point", coordinates: [p.lon, p.lat] } as unknown,
    })),
  ];
  return JSON.stringify({ type: "FeatureCollection", features });
}

const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

export interface DbfField {
  name: string;
  /** C = texto, N = número */
  type: "C" | "N";
  length: number;
  decimals?: number;
}

const enc = new TextEncoder();

/** Corta un texto para que ocupe como mucho `max` bytes en UTF-8 sin partir un carácter. */
function fitBytes(s: string, max: number): Uint8Array {
  let out = s;
  while (enc.encode(out).length > max) out = out.slice(0, -1);
  return enc.encode(out);
}

function dbfBytes(fields: DbfField[], rows: Record<string, string | number | null>[]): ArrayBuffer {
  const headerLen = 32 + 32 * fields.length + 1;
  const recLen = 1 + fields.reduce((n, f) => n + f.length, 0);
  const buf = new Uint8Array(headerLen + recLen * rows.length + 1);
  const v = new DataView(buf.buffer);
  const now = new Date();
  buf[0] = 3;
  buf[1] = now.getFullYear() - 1900;
  buf[2] = now.getMonth() + 1;
  buf[3] = now.getDate();
  v.setUint32(4, rows.length, true);
  v.setUint16(8, headerLen, true);
  v.setUint16(10, recLen, true);
  fields.forEach((f, i) => {
    const o = 32 + 32 * i;
    buf.set(enc.encode(f.name.slice(0, 10)), o);
    buf[o + 11] = f.type.charCodeAt(0);
    buf[o + 16] = f.length;
    buf[o + 17] = f.decimals ?? 0;
  });
  buf[headerLen - 1] = 0x0d;
  rows.forEach((row, r) => {
    let o = headerLen + r * recLen;
    buf[o++] = 0x20;
    for (const f of fields) {
      const val = row[f.name];
      buf.fill(0x20, o, o + f.length);
      if (val !== null && val !== undefined) {
        if (f.type === "N") {
          const txt = Number(val)
            .toFixed(f.decimals ?? 0)
            .padStart(f.length, " ");
          buf.set(enc.encode(txt.slice(-f.length)), o);
        } else buf.set(fitBytes(String(val), f.length), o);
      }
      o += f.length;
    }
  });
  buf[buf.length - 1] = 0x1a;
  return buf.buffer;
}

type Ring = number[][];
const ringArea2 = (r: Ring) =>
  r.reduce((a, p, i) => a + (r[(i + 1) % r.length]![0]! - p[0]!) * (r[(i + 1) % r.length]![1]! + p[1]!), 0);

/** Anillos de un Polygon/MultiPolygon en el orden de Esri: exteriores horarios, huecos antihorarios. */
function esriRings(g: { type: string; coordinates: unknown }): Ring[] {
  const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as Ring[][];
  const out: Ring[] = [];
  for (const poly of polys)
    poly.forEach((ring, i) => {
      const clockwise = ringArea2(ring) > 0;
      out.push(clockwise === (i === 0) ? ring : [...ring].reverse());
    });
  return out;
}

interface ShpShape {
  content: Uint8Array;
  box: [number, number, number, number];
}

function polygonShape(rings: Ring[]): ShpShape {
  const pts = rings.flat();
  const xs = pts.map((p) => p[0]!);
  const ys = pts.map((p) => p[1]!);
  const box: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const len = 44 + 4 * rings.length + 16 * pts.length;
  const b = new DataView(new ArrayBuffer(len));
  b.setInt32(0, 5, true);
  box.forEach((x, i) => b.setFloat64(4 + i * 8, x, true));
  b.setInt32(36, rings.length, true);
  b.setInt32(40, pts.length, true);
  let start = 0;
  rings.forEach((r, i) => {
    b.setInt32(44 + 4 * i, start, true);
    start += r.length;
  });
  const base = 44 + 4 * rings.length;
  pts.forEach((p, i) => {
    b.setFloat64(base + i * 16, p[0]!, true);
    b.setFloat64(base + i * 16 + 8, p[1]!, true);
  });
  return { content: new Uint8Array(b.buffer), box };
}

function pointShape(lon: number, lat: number): ShpShape {
  const b = new DataView(new ArrayBuffer(20));
  b.setInt32(0, 1, true);
  b.setFloat64(4, lon, true);
  b.setFloat64(12, lat, true);
  return { content: new Uint8Array(b.buffer), box: [lon, lat, lon, lat] };
}

/** Arma .shp y .shx de un conjunto de formas del mismo tipo. */
function shpFiles(type: 1 | 5, shapes: ShpShape[]): { shp: ArrayBuffer; shx: ArrayBuffer } {
  const shpLen = 100 + shapes.reduce((n, s) => n + 8 + s.content.length, 0);
  const shxLen = 100 + 8 * shapes.length;
  const shp = new Uint8Array(shpLen);
  const shx = new Uint8Array(shxLen);
  const box = [
    Math.min(...shapes.map((s) => s.box[0])),
    Math.min(...shapes.map((s) => s.box[1])),
    Math.max(...shapes.map((s) => s.box[2])),
    Math.max(...shapes.map((s) => s.box[3])),
  ];
  for (const [arr, len] of [
    [shp, shpLen],
    [shx, shxLen],
  ] as const) {
    const h = new DataView(arr.buffer);
    h.setInt32(0, 9994);
    h.setInt32(24, len / 2);
    h.setInt32(28, 1000, true);
    h.setInt32(32, type, true);
    box.forEach((x, i) => h.setFloat64(36 + i * 8, x, true));
  }
  const sv = new DataView(shp.buffer);
  const xv = new DataView(shx.buffer);
  let off = 100;
  shapes.forEach((s, i) => {
    sv.setInt32(off, i + 1);
    sv.setInt32(off + 4, s.content.length / 2);
    shp.set(s.content, off + 8);
    xv.setInt32(100 + i * 8, off / 2);
    xv.setInt32(104 + i * 8, s.content.length / 2);
    off += 8 + s.content.length;
  });
  return { shp: shp.buffer, shx: shx.buffer };
}

/** Shapefile de polígonos en WGS84 (zip con .shp, .shx, .dbf, .prj y .cpg), con las columnas que se indiquen (A-33). */
export async function polygonsToShapefileZip(
  base: string,
  items: { geometry: { type: string; coordinates: unknown }; row: Record<string, string | number | null> }[],
  fields: DbfField[],
): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const { shp, shx } = shpFiles(
    5,
    items.map((i) => polygonShape(esriRings(i.geometry))),
  );
  zip.file(`${base}.shp`, shp);
  zip.file(`${base}.shx`, shx);
  zip.file(`${base}.dbf`, dbfBytes(fields, items.map((i) => i.row)));
  zip.file(`${base}.prj`, WGS84_PRJ);
  zip.file(`${base}.cpg`, "UTF-8");
  return zip.generateAsync({ type: "blob" });
}

/** Zip con lotes.* (polígonos) y puntos.* (puntos de interés), en WGS84 y UTF-8. */
export async function plotsToShapefileZip(plots: Plot[], points: ExportPoint[] = []): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const add = (
    base: string,
    type: 1 | 5,
    shapes: ShpShape[],
    fields: DbfField[],
    rows: Record<string, string | number | null>[],
  ) => {
    const { shp, shx } = shpFiles(type, shapes);
    zip.file(`${base}.shp`, shp);
    zip.file(`${base}.shx`, shx);
    zip.file(`${base}.dbf`, dbfBytes(fields, rows));
    zip.file(`${base}.prj`, WGS84_PRJ);
    zip.file(`${base}.cpg`, "UTF-8");
  };
  if (plots.length)
    add(
      "lotes",
      5,
      plots.map((p) => polygonShape(esriRings(JSON.parse(p.geometry)))),
      [
        { name: "nombre", type: "C", length: 80 },
        { name: "tipo", type: "C", length: 12 },
        { name: "cultivo", type: "C", length: 30 },
        { name: "sup_ha", type: "N", length: 14, decimals: 2 },
      ],
      plots.map((p) => ({ nombre: p.name, tipo: p.kind, cultivo: p.crop, sup_ha: p.areaHa })),
    );
  if (points.length)
    add(
      "puntos",
      1,
      points.map((p) => pointShape(p.lon, p.lat)),
      [
        { name: "nombre", type: "C", length: 80 },
        { name: "tipo", type: "C", length: 20 },
      ],
      points.map((p) => ({ nombre: p.name, tipo: p.kind })),
    );
  return zip.generateAsync({ type: "blob" });
}
