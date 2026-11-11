/** Exportación completa de la organización (R-09): ZIP con Excel, KML y GeoJSON, armado en el navegador. */
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { get } from "./api";
import { describeData, plotsToKml } from "./exports";
import { fmtDateTime } from "./format";
import { tk } from "./i18n";
import { fetchAllRecords } from "./queries";
import { mapLimit } from "./reportsData";
import type { FarmDetail, FarmSummary, Member, Plot, RecordRow, Task } from "./types";

export interface ExportFarm {
  farm: { id: string; name: string };
  plots: Plot[];
  records: RecordRow[];
  tasks: Task[];
}

export interface PhotoLink {
  recordId: string;
  farm: string;
  capturedAt: number;
  attachmentId: string;
  url: string;
}

export interface ExportData {
  orgName: string;
  farms: ExportFarm[];
  members: Member[];
  photos: PhotoLink[];
  /** Estancias cuyos registros se cortaron por el tope. */
  truncated: string[];
  generatedAt: number;
}

export const MAX_RECORDS_PER_FARM = 20_000;
export const MAX_PHOTO_LINKS = 1000;

export function plotsToGeoJson(farms: ExportFarm[]): FeatureCollection {
  const features: Feature[] = farms.flatMap((f) =>
    f.plots.map((p) => ({
      type: "Feature" as const,
      geometry: JSON.parse(p.geometry) as Geometry,
      properties: {
        id: p.id,
        estancia: f.farm.name,
        lote: p.name,
        tipo: p.kind,
        cultivo: p.crop,
        campana: p.season,
        siembra: p.sowingDate,
        superficie_ha: Number(p.areaHa.toFixed(2)),
      },
    })),
  );
  return { type: "FeatureCollection", features };
}

const safeName = (s: string) => s.replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "") || "estancia";

export async function buildWorkbook(d: ExportData): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const sheet = (name: string, headers: string[], rows: (string | number | null)[][]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(14, h.length + 4) }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(r);
  };
  sheet(
    "Lotes",
    ["Estancia", "Lote", "Tipo", "Cultivo", "Campaña", "Siembra", "Superficie (ha)"],
    d.farms.flatMap((f) =>
      f.plots.map((p) => [
        f.farm.name,
        p.name,
        p.kind === "pasture" ? "Potrero" : "Cultivo",
        p.crop,
        p.season,
        p.sowingDate,
        Number(p.areaHa.toFixed(2)),
      ]),
    ),
  );
  sheet(
    "Registros",
    ["Fecha", "Estancia", "Lote", "Tipo", "Empleado", "Detalle", "Latitud", "Longitud", "Fotos"],
    d.farms.flatMap((f) =>
      f.records.map((r) => [
        fmtDateTime(r.capturedAt),
        f.farm.name,
        r.plotName,
        tk(`recordKinds.${r.kind}`),
        r.authorName,
        describeData(r.kind, r.data),
        r.lat,
        r.lon,
        r.attachments.length,
      ]),
    ),
  );
  sheet(
    "Tareas",
    ["Estancia", "Tarea", "Lote", "Asignada a", "Fecha", "Estado", "Repetición"],
    d.farms.flatMap((f) =>
      f.tasks.map((x) => [f.farm.name, x.title, x.plotName, x.assigneeName, x.dueDate, x.status, x.recurrence]),
    ),
  );
  sheet(
    "Miembros",
    ["Nombre", "Email", "Teléfono", "Rol", "Estado"],
    d.members.map((m) => [m.fullName, m.email, m.phone, tk(`ui.role_${m.role}`), m.status]),
  );
  sheet(
    "Fotos",
    ["Fecha del registro", "Estancia", "Id del registro", "Id de la foto", "Enlace firmado (vence en 1 hora)"],
    d.photos.map((p) => [fmtDateTime(p.capturedAt), p.farm, p.recordId, p.attachmentId, p.url]),
  );
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export async function buildExportZip(d: ExportData): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("yvy-exportacion.xlsx", await buildWorkbook(d));
  zip.file("lotes.geojson", JSON.stringify(plotsToGeoJson(d.farms)));
  const used = new Set<string>();
  for (const f of d.farms) {
    let name = safeName(f.farm.name);
    while (used.has(name)) name += "_";
    used.add(name);
    zip.file(`kml/${name}.kml`, plotsToKml(f.plots, f.farm.name));
  }
  const notes = [
    `Exportación de ${d.orgName} generada por Yvy el ${fmtDateTime(d.generatedAt)}.`,
    "",
    "yvy-exportacion.xlsx: lotes, registros, tareas, miembros y enlaces a las fotos.",
    "lotes.geojson y kml/: geometrías de los lotes.",
    "Las fotos no se incluyen para que el archivo sea liviano: la hoja Fotos tiene enlaces firmados que vencen en 1 hora.",
    ...(d.photos.length >= MAX_PHOTO_LINKS ? [`Se listan las primeras ${MAX_PHOTO_LINKS} fotos.`] : []),
    ...d.truncated.map((n) => `Los registros de ${n} se cortaron en ${MAX_RECORDS_PER_FARM}.`),
  ];
  zip.file("LEEME.txt", notes.join("\n"));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

/** Junta los datos con los endpoints existentes (solo lectura). */
export async function collectExportData(orgName: string, onProgress?: (msg: string) => void): Promise<ExportData> {
  const farmList = await get<FarmSummary[]>("/org/farms");
  const members = await get<Member[]>("/org/members");
  const farms: ExportFarm[] = [];
  const truncated: string[] = [];
  for (const f of farmList) {
    onProgress?.(f.name);
    const [detail, records, tasks] = await Promise.all([
      get<FarmDetail>(`/org/farms/${f.id}`),
      fetchAllRecords({ farmId: f.id }, MAX_RECORDS_PER_FARM),
      get<Task[]>(`/org/tasks?farmId=${f.id}`),
    ]);
    if (records.length >= MAX_RECORDS_PER_FARM) truncated.push(f.name);
    farms.push({ farm: { id: f.id, name: f.name }, plots: detail.plots, records, tasks });
  }
  const targets = farms
    .flatMap((f) =>
      f.records.flatMap((r) =>
        r.attachments
          .filter((a) => a.uploadStatus === "uploaded")
          .map((a) => ({ recordId: r.id, farm: f.farm.name, capturedAt: r.capturedAt, attachmentId: a.id })),
      ),
    )
    .slice(0, MAX_PHOTO_LINKS);
  const links = await mapLimit(targets, 6, async (x) => {
    const r = await get<{ url: string }>(`/media/attachments/${x.attachmentId}`).catch(() => null);
    return r ? ({ ...x, url: r.url } satisfies PhotoLink) : null;
  });
  return {
    orgName,
    farms,
    members,
    photos: links.filter((x): x is PhotoLink => x !== null),
    truncated,
    generatedAt: Date.now(),
  };
}
