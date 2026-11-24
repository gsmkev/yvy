/** Registros de campo y sus comentarios: escrituras en transacción con el outbox y lecturas para la UI. */
import { computeStock, LIMITS, newId, normalizeTag, RECORD_SCHEMA_VERSION, type CountEvent, type HerdCategory, type HerdCounts, type MortalityEvent, type MoveEvent, type PlotStock } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { type RecordRow, type NewRecord, type LocalAudio, type LocalPhoto, type Ctx, enqueue, fromRow } from "./core";
import { localPhoto } from "./files";

type Owner = { orgId: string; recordId: string; ts: number };

/** Fila del registro (insertar o actualizar) y su mutación `records.upsert`. */
function upsertRecordRow(db: Ctx, userId: string, { orgId, recordId, ts }: Owner, createdAt: number, input: NewRecord): void {
  const row = {
    id: recordId,
    farmId: input.farmId,
    plotId: input.plotId,
    poiId: input.poiId,
    kind: input.kind,
    data: input.data,
    schemaVersion: RECORD_SCHEMA_VERSION,
    lon: input.lon,
    lat: input.lat,
    gpsAccuracyM: input.gpsAccuracyM,
    capturedAt: input.capturedAt,
  };
  db.sql.run(
    `INSERT INTO records (id, organization_id, farm_id, plot_id, poi_id, author_id, kind, data, schema_version, lon, lat, gps_accuracy_m, captured_at, device_id, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET farm_id = excluded.farm_id, plot_id = excluded.plot_id, poi_id = excluded.poi_id, kind = excluded.kind,
       data = excluded.data, lon = excluded.lon, lat = excluded.lat, gps_accuracy_m = excluded.gps_accuracy_m, captured_at = excluded.captured_at, updated_at = excluded.updated_at`,
    [
      recordId,
      orgId,
      input.farmId,
      input.plotId,
      input.poiId,
      userId,
      input.kind,
      JSON.stringify(input.data),
      RECORD_SCHEMA_VERSION,
      input.lon,
      input.lat,
      input.gpsAccuracyM,
      input.capturedAt,
      createdAt,
      ts,
    ],
  );
  enqueue(db, { mutationId: newId(), kind: "records.upsert", row }, recordId);
}

/** Adjunto de una foto: fila, archivo local y mutación `attachments.upsert`. */
function attachPhoto(db: Ctx, { orgId, recordId, ts }: Owner, p: LocalPhoto): void {
  const id = newId();
  db.sql.run(
    `INSERT INTO attachments (id, organization_id, record_id, storage_path, thumb_path, mime, width, height, bytes, upload_status, created_at, updated_at, version)
     VALUES (?, ?, ?, '', '', 'image/webp', ?, ?, ?, 'pending', ?, ?, 0)`,
    [id, orgId, recordId, p.width, p.height, p.bytes, ts, ts],
  );
  db.sql.run("INSERT INTO local_files (attachment_id, photo_uri, thumb_uri) VALUES (?, ?, ?)", [id, p.photoUri, p.thumbUri]);
  enqueue(
    db,
    { mutationId: newId(), kind: "attachments.upsert", row: { id, recordId, mime: "image/webp", width: p.width, height: p.height, bytes: p.bytes } },
    id,
  );
}

/** Adjunto de la nota de voz: sin miniatura ni medidas. */
function attachAudio(db: Ctx, { orgId, recordId, ts }: Owner, audio: LocalAudio): void {
  const id = newId();
  db.sql.run(
    `INSERT INTO attachments (id, organization_id, record_id, storage_path, thumb_path, mime, width, height, bytes, upload_status, created_at, updated_at, version)
     VALUES (?, ?, ?, '', '', ?, NULL, NULL, ?, 'pending', ?, ?, 0)`,
    [id, orgId, recordId, LIMITS.audio.mime, audio.bytes, ts, ts],
  );
  db.sql.run("INSERT INTO local_files (attachment_id, photo_uri, thumb_uri) VALUES (?, ?, '')", [id, audio.uri]);
  enqueue(
    db,
    { mutationId: newId(), kind: "attachments.upsert", row: { id, recordId, mime: LIMITS.audio.mime, width: null, height: null, bytes: audio.bytes } },
    id,
  );
}

/** Guarda un registro con sus fotos. Todo en una transacción con sus mutaciones. */
export function saveRecord(db: Ctx, userId: string, orgId: string, input: NewRecord, photos: LocalPhoto[] = [], recordId = newId(), audio: LocalAudio | null = null): string {
  if (photos.length > LIMITS.photos.maxPerRecord) throw new Error("too_many_attachments");
  if (audio && audio.bytes > LIMITS.audio.maxBytes) throw new Error("audio_too_big");
  const owner: Owner = { orgId, recordId, ts: db.now() };
  const existing = db.sql.get<{ created_at: number }>("SELECT created_at FROM records WHERE id = ?", [recordId]);
  db.sql.tx(() => {
    upsertRecordRow(db, userId, owner, existing?.created_at ?? owner.ts, input);
    for (const p of photos) attachPhoto(db, owner, p);
    if (audio) attachAudio(db, owner, audio);
  });
  return recordId;
}

/**
 * Un registro por lote, todo en una transacción y con el mismo capturedAt (anotar en varios lotes).
 * Las fotos van en el primero: subirlas una vez por lote sería mandar lo mismo varias veces.
 */
export function saveRecords(db: Ctx, userId: string, orgId: string, inputs: NewRecord[], photos: LocalPhoto[] = [], audio: LocalAudio | null = null): string[] {
  return db.sql.tx(() => inputs.map((input, i) => saveRecord(db, userId, orgId, input, i === 0 ? photos : [], undefined, i === 0 ? audio : null)));
}

/** Borra un registro (borrado lógico) junto con su mutación. */
export function deleteRecord(db: Ctx, recordId: string): void {
  const ts = db.now();
  db.sql.tx(() => {
    db.sql.run("UPDATE records SET deleted_at = ?, updated_at = ? WHERE id = ?", [ts, ts, recordId]);
    enqueue(db, { mutationId: newId(), kind: "records.delete", row: { id: recordId } }, recordId);
  });
}

/** Comentarios de un registro (los de otras personas bajan con el sync). */
export function commentsOf(db: Ctx, recordId: string): { id: string; authorName: string; body: string; createdAt: number }[] {
  return db.sql.all(
    "SELECT id, author_name AS authorName, body, created_at AS createdAt FROM comments WHERE record_id = ? AND deleted_at IS NULL ORDER BY created_at, id",
    [recordId],
  );
}

/** Comentar sin señal. Las menciones se hacen desde la web (el celular no tiene la lista de personas). */
export function addComment(db: Ctx, userId: string, orgId: string, authorName: string, recordId: string, body: string): string {
  const id = newId();
  const ts = db.now();
  db.sql.tx(() => {
    db.sql.run(
      "INSERT INTO comments (id, organization_id, record_id, author_id, author_name, body, mentions, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, 0)",
      [id, orgId, recordId, userId, authorName, body, ts, ts],
    );
    enqueue(db, { mutationId: newId(), kind: "comments.upsert", row: { id, recordId, body, mentions: [] } }, id);
  });
  return id;
}

/** Registros recientes dentro de la ventana de historial, hasta `limit`. */
export function records(db: Ctx, limit = 200): RecordRow[] {
  const since = db.now() - LIMITS.sync.recordsHistoryMs;
  return db.sql
    .all(
      `SELECT r.*,
        EXISTS (SELECT 1 FROM outbox o WHERE o.rejected_reason IS NULL AND (o.row_id = r.id OR o.row_id IN (SELECT id FROM attachments WHERE record_id = r.id))) AS _pending,
        (SELECT rejected_reason FROM outbox o WHERE o.row_id = r.id AND o.rejected_reason IS NOT NULL LIMIT 1) AS _rejected,
        (SELECT count(*) FROM attachments a WHERE a.record_id = r.id AND a.deleted_at IS NULL AND a.mime NOT LIKE 'audio/%') AS _photos,
        (SELECT count(*) FROM attachments a WHERE a.record_id = r.id AND a.deleted_at IS NULL AND a.mime LIKE 'audio/%') AS _voice
       FROM records r WHERE r.deleted_at IS NULL AND r.captured_at >= ? ORDER BY r.captured_at DESC LIMIT ?`,
      [since, limit],
    )
    .map((r) => ({
      ...fromRow<typeof s.records.$inferSelect>(s.records, r),
      pending: !!r._pending,
      rejected: (r._rejected as string | null) ?? null,
      photos: Number(r._photos),
      voice: Number(r._voice),
    }));
}

/** Un registro por id (ficha); null si no existe o fue borrado. */
export function recordById(db: Ctx, id: string): RecordRow | null {
  return records(db, 500).find((r) => r.id === id) ?? null;
}

/** Fotos del registro; `thumbUri` es null si la miniatura no está en este celular. */
export function photosOfRecord(db: Ctx, recordId: string): { id: string; thumbUri: string | null }[] {
  return db.sql
    .all<{ id: string }>("SELECT id FROM attachments WHERE record_id = ? AND deleted_at IS NULL AND mime NOT LIKE 'audio/%' ORDER BY created_at", [recordId])
    .map((a) => ({ id: a.id, thumbUri: localPhoto(db, a.id) }));
}

/** Nota de voz del registro: archivo local si está en este celular, y si ya se subió. */
export function voiceOfRecord(db: Ctx, recordId: string): { id: string; uri: string | null; uploaded: boolean }[] {
  return db.sql
    .all<{ id: string; upload_status: string }>(
      "SELECT id, upload_status FROM attachments WHERE record_id = ? AND deleted_at IS NULL AND mime LIKE 'audio/%' ORDER BY created_at",
      [recordId],
    )
    .map((a) => ({
      id: a.id,
      uri: db.sql.get<{ photo_uri: string }>("SELECT photo_uri FROM local_files WHERE attachment_id = ?", [a.id])?.photo_uri || null,
      uploaded: a.upload_status === "uploaded",
    }));
}

/** Primera miniatura local de cada registro con fotos (Historial). Las fotos de otro celular no tienen miniatura acá. */
export function firstThumbByRecord(db: Ctx): Map<string, string> {
  const rows = db.sql.all<{ record_id: string; thumb_uri: string }>(
    `SELECT a.record_id, f.thumb_uri FROM attachments a JOIN local_files f ON f.attachment_id = a.id
     WHERE a.deleted_at IS NULL AND a.mime NOT LIKE 'audio/%' ORDER BY a.created_at DESC, a.rowid DESC`,
  );
  // Se recorre de la más nueva a la más vieja: la última escritura en el mapa es la primera foto.
  return new Map(rows.map((r) => [r.record_id, r.thumb_uri] as const));
}

/** Hasta `max` miniaturas locales por registro, en el orden en que se sacaron (Historial). */
export function thumbsByRecord(db: Ctx, max = 2): Map<string, string[]> {
  const rows = db.sql.all<{ record_id: string; thumb_uri: string }>(
    `SELECT a.record_id, f.thumb_uri FROM attachments a JOIN local_files f ON f.attachment_id = a.id
     WHERE a.deleted_at IS NULL AND a.mime NOT LIKE 'audio/%' ORDER BY a.created_at, a.rowid`,
  );
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const list = out.get(r.record_id) ?? [];
    if (list.length < max) out.set(r.record_id, [...list, r.thumb_uri]);
  }
  return out;
}

/** Últimas anotaciones de un lote (ficha del lote y pantalla Anotar). */
export function recordsOfPlot(db: Ctx, plotId: string, limit = 20): RecordRow[] {
  return records(db, 500).filter((r) => r.plotId === plotId).slice(0, limit);
}

/**
 * Hacienda actual de un potrero, calculada con lo que hay en el celular: último conteo más
 * movimientos y mortandad posteriores. Funciona sin señal. `null` si el potrero nunca tuvo datos de hacienda.
 */
export function herdStock(db: Ctx, plotId: string): PlotStock | null {
  const rows = db.sql.all<{ kind: string; plot_id: string | null; captured_at: number; data: string }>(
    "SELECT kind, plot_id, captured_at, data FROM records WHERE deleted_at IS NULL AND kind IN ('herd_count','herd_move','mortality','theft') AND (plot_id = ? OR (kind = 'herd_move' AND data LIKE ?))",
    [plotId, `%${plotId}%`],
  );
  const counts: CountEvent[] = [];
  const moves: MoveEvent[] = [];
  const deaths: MortalityEvent[] = [];
  for (const r of rows) {
    let d: { counts?: HerdCounts; toPlotId?: string; category?: HerdCategory; head?: number };
    try {
      d = JSON.parse(r.data);
    } catch {
      continue;
    }
    if (r.kind === "herd_count" && r.plot_id === plotId && d.counts)
      counts.push({ plotId, capturedAt: r.captured_at, counts: d.counts });
    else if (r.kind === "herd_move" && d.counts) {
      if (r.plot_id === plotId || d.toPlotId === plotId)
        moves.push({ fromPlotId: r.plot_id, toPlotId: d.toPlotId ?? null, capturedAt: r.captured_at, counts: d.counts });
    } else if ((r.kind === "mortality" || r.kind === "theft") && r.plot_id === plotId && d.category && typeof d.head === "number")
      deaths.push({ plotId, capturedAt: r.captured_at, category: d.category, head: d.head });
  }
  if (!counts.length && !moves.length && !deaths.length) return null;
  return computeStock([plotId], counts, moves, deaths).get(plotId) ?? null;
}

/** Lluvia del mes en curso según el pluviómetro (mm), para mostrar al terminar de anotar. */
export function rainThisMonth(db: Ctx, farmId: string, now = db.now()): number {
  const d = new Date(now - 3 * 3_600_000);
  const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + 3 * 3_600_000;
  const rows = db.sql.all<{ data: string }>(
    "SELECT data FROM records WHERE farm_id = ? AND kind = 'rain' AND deleted_at IS NULL AND captured_at >= ?",
    [farmId, from],
  );
  return rows.reduce((a, r) => a + (Number((JSON.parse(r.data) as { mm?: number }).mm) || 0), 0);
}

/** Último registro por lote, para saber qué lotes hace días que nadie recorre. */
export function lastVisitByPlot(db: Ctx): Map<string, number> {
  const rows = db.sql.all<{ plot_id: string; last: number }>(
    "SELECT plot_id, max(captured_at) AS last FROM records WHERE plot_id IS NOT NULL AND deleted_at IS NULL GROUP BY plot_id",
  );
  return new Map(rows.map((r) => [r.plot_id, r.last]));
}

/** Registros que llevan la caravana (pesadas, reproducción, sanidad), del más nuevo al más viejo; sin señal. */
export function recordsOfTag(db: Ctx, tag: string, limit = 100): RecordRow[] {
  return db.sql
    .all(
      `SELECT r.*, 0 AS _pending, NULL AS _rejected, 0 AS _photos FROM records r
       WHERE r.deleted_at IS NULL AND r.kind IN ('weighing','reproduction','health') AND json_extract(r.data, '$.tag') = ?
       ORDER BY r.captured_at DESC LIMIT ?`,
      [normalizeTag(tag), limit],
    )
    .map((r) => ({
      ...fromRow<typeof s.records.$inferSelect>(s.records, r),
      pending: false,
      rejected: null,
      photos: 0,
      voice: 0,
    }));
}
