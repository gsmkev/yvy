import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
import { closeRequirements, LIMITS, type RecordKind } from "@yvy/shared";
import { getDb } from "../lib/db";
import { selectedFarmId } from "../lib/farmFilter";
import { kindForPoi } from "../lib/poiQr";
import { useSession } from "../lib/session";

/** Lo que el registro ya trae de antes: parámetros de la ruta, el registro a editar, el punto escaneado y la tarea. Se lee una sola vez. */
export function useAnnotateSource() {
  const params = useLocalSearchParams<{ plotId?: string; kind?: RecordKind; taskId?: string; recordId?: string; farmLevel?: string; poiId?: string }>();
  const session = useSession()!;
  const db = getDb();
  const plots = useMemo(() => db.plots(selectedFarmId(db) ?? undefined), []);
  // Edición (RF-34): el mismo registro, con sus datos cargados; se guarda con el mismo id.
  const editing = useMemo(() => (params.recordId ? db.recordById(params.recordId) : null), []);
  // F-28: se llegó escaneando el QR de un punto de interés: se anota ahí (lote, estancia y punto salen de él).
  const scanPoi = useMemo(() => (params.poiId && !params.recordId ? db.pois().find((p) => p.id === params.poiId) ?? null : null), []);
  const presetKind: RecordKind | null = params.kind ?? (scanPoi ? kindForPoi(scanPoi.kind) : null);
  const existingPhotos = useMemo(() => (editing ? db.photosOfRecord(editing.id).length : 0), []);
  const maxNewPhotos = LIMITS.photos.maxPerRecord - existingPhotos;
  // Un registro lleva a lo sumo una nota de voz: al editar uno que ya la tiene no se ofrece otra.
  const hasVoice = useMemo(() => (editing ? db.voiceOfRecord(editing.id).length > 0 : false), []);
  // Campañas activas que bajaron al celular: con una sola no se pregunta, se usa esa.
  const seasons = useMemo(() => db.activeSeasons(), []);
  // T-03: la tarea de este tipo pide foto y/o ubicación para poder cerrarse
  const closeReq = useMemo(() => (params.taskId && !editing ? closeRequirements(db.taskById(params.taskId)?.kind) : null), []);
  return { params, session, db, plots, editing, scanPoi, presetKind, existingPhotos, maxNewPhotos, hasVoice, seasons, closeReq };
}
