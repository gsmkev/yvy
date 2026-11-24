/** Guardado de la anotación: arma los datos y los escribe en la base local. */
import { parseRecordData, splitExtraAnswers, type RecordKind } from "@yvy/shared";
import type { LocalAudio, LocalPhoto, Plot } from "../db/store";
import { getDb } from "../lib/db";
import { selectedFarmId } from "../lib/farmFilter";
import type { Fix } from "../lib/location";
import { localChanged } from "../lib/sync";
import { toastSaved } from "../lib/toast";

type Db = ReturnType<typeof getDb>;
type Editing = NonNullable<ReturnType<Db["recordById"]>>;

/** Datos necesarios para guardar una anotación. */
export type SaveCtx = {
  db: Db;
  userId: string;
  organizationId: string;
  kind: RecordKind;
  values: Record<string, unknown>;
  editing: Editing | null;
  scanPoiFarmId?: string;
  plot: Plot | null;
  multi: Plot[];
  fix: Fix | null | "searching";
  photos: LocalPhoto[];
  voice: LocalAudio | null;
  taskId?: string;
  markSaved: () => void;
};

/** Qué hacer con la pantalla después de intentar guardar. */
export type SaveResult = { type: "invalid" } | { type: "none" } | { type: "saved"; recordId: string; leave: boolean };

/** Completa los datos con lo que sale de los catálogos y de la hora de captura. */
function buildData(c: SaveCtx): { data: Record<string, unknown>; entersFromOutside: boolean; pickedPoi: unknown } {
  const { db, kind, editing, plot } = c;
  const { poiId: pickedPoi, ...answers } = c.values;
  const { rest, extra } = splitExtraAnswers(answers);
  const data: Record<string, unknown> = { ...rest, ...(extra ? { extra } : {}) };
  // Tratamiento con producto del catálogo: el nombre sale del catálogo.
  if (kind === "health" && typeof data.productId === "string")
    data.product = db.products().find((p) => p.id === data.productId)?.name ?? data.product;
  // Combustible: el nombre de la máquina sale del catálogo.
  if (kind === "fuel_load" && typeof data.machineId === "string")
    data.machine = db.machines().find((m) => m.id === data.machineId)?.name ?? data.machine;
  if (kind === "rain" && !editing) data.readAt = Date.now();
  if (kind === "irrigation" && !editing) data.appliedAt = Date.now();
  // Abigeato: si ya hay número de denuncia, la fecha de la denuncia es hoy.
  if (kind === "theft" && !editing && data.policeReport) data.reportedAt = Date.now();
  // Compra: la hacienda entra de afuera, así que el potrero elegido es el destino y no hay origen.
  const entersFromOutside = kind === "herd_move" && data.reason === "compra" && !!plot;
  if (entersFromOutside) data.toPlotId = plot!.id;
  return { data, entersFromOutside, pickedPoi };
}

function finish(c: SaveCtx, recordId: string, leave: boolean): SaveResult {
  c.markSaved();
  if (c.taskId) c.db.completeTask(c.taskId, recordId);
  localChanged();
  toastSaved();
  return { type: "saved", recordId, leave };
}

function saveMany(c: SaveCtx, data: Record<string, unknown>): SaveResult {
  const f = c.fix === "searching" ? null : c.fix;
  const at = Date.now();
  const ids = c.db.saveRecords(
    c.userId,
    c.organizationId,
    c.multi.map((p) => ({
      farmId: p.farmId,
      plotId: p.id,
      poiId: null,
      kind: c.kind,
      data,
      lon: f?.lon ?? null,
      lat: f?.lat ?? null,
      gpsAccuracyM: f?.accuracy ?? null,
      capturedAt: at,
    })),
    c.photos,
    c.voice,
  );
  return finish(c, ids[0]!, false);
}

function saveOne(c: SaveCtx, data: Record<string, unknown>, farmId: string, entersFromOutside: boolean, pickedPoi: unknown): SaveResult {
  const { editing, plot } = c;
  const f = c.fix === "searching" ? null : c.fix;
  const recordId = c.db.saveRecord(
    c.userId,
    c.organizationId,
    {
      farmId,
      plotId: entersFromOutside ? null : (plot?.id ?? null),
      poiId: editing?.poiId ?? (typeof pickedPoi === "string" ? pickedPoi : null),
      kind: c.kind,
      data,
      lon: editing ? editing.lon : (f?.lon ?? null),
      lat: editing ? editing.lat : (f?.lat ?? null),
      gpsAccuracyM: editing ? editing.gpsAccuracyM : (f?.accuracy ?? null),
      capturedAt: editing?.capturedAt ?? Date.now(),
    },
    c.photos,
    editing?.id,
    c.voice,
  );
  return finish(c, recordId, !!editing);
}

/** Guarda el registro (o uno por lote marcado) con sus fotos y su nota de voz. */
export function saveAnnotation(c: SaveCtx): SaveResult {
  const { db, kind, editing, plot, multi } = c;
  const { data, entersFromOutside, pickedPoi } = buildData(c);
  const parsed = parseRecordData(kind, data);
  if (!parsed.success) return { type: "invalid" };
  const farmId = editing?.farmId ?? c.scanPoiFarmId ?? plot?.farmId ?? selectedFarmId(db) ?? db.farms()[0]?.id;
  if (!farmId) return { type: "none" };
  const parsedData = parsed.data as Record<string, unknown>;
  if (multi.length > 1 && !editing) return saveMany(c, parsedData);
  return saveOne(c, parsedData, farmId, entersFromOutside, pickedPoi);
}
