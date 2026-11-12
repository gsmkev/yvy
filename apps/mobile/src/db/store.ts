/**
 * Base local del celular (PRD §11): mismas tablas que D1 + outbox, cursores y archivos locales.
 * Implementa SyncStore para el motor de packages/sync.
 *
 * Reglas:
 * - Toda escritura del usuario va en una transacción junto con su mutación en el outbox.
 * - El pull nunca pisa una fila con mutaciones pendientes (lo local es más nuevo).
 * - El reset por cambio de asignaciones conserva lo pendiente.
 */
import { getTableColumns, getTableName } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  computeStock,
  isDueToday,
  LIMITS,
  localDate,
  newId,
  nextDueDate,
  nextOccurrenceId,
  parseChecklist,
  orderSchema,
  prescriptionSchema,
  RECORD_SCHEMA_VERSION,
  resetChecklist,
  serializeChecklist,
  setChecklistItem,
  type CountEvent,
  type Prescription,
  type WorkOrder,
  type Cursor,
  type HerdCategory,
  type HerdCounts,
  type MortalityEvent,
  type Mutation,
  type MoveEvent,
  type PlotStock,
  type PullTable,
  type RecordKind,
  type RejectReason,
} from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import type { SyncStore } from "@yvy/sync";
import { SERVER_SCHEMA } from "./schema-sql";
import { LOCAL_SCHEMA, type Param, type Sql } from "./sql";

const TABLES: Record<PullTable, SQLiteTable> = {
  farms: s.farms,
  plots: s.plots,
  points_of_interest: s.pointsOfInterest,
  plot_assignments: s.plotAssignments,
  tasks: s.tasks,
  records: s.records,
  attachments: s.attachments,
  alerts: s.alerts,
  plot_index_stats: s.plotIndexStats,
  farm_layers: s.farmLayers,
  seasons: s.seasons,
  plot_seasons: s.plotSeasons,
  products: s.products,
  machines: s.machines,
};

/** jsKey → columna SQL, sacado del esquema compartido. */
const columnsOf = (t: SQLiteTable) => Object.entries(getTableColumns(t)).map(([key, col]) => ({ key, name: col.name }));
const COLS = Object.fromEntries(Object.entries(TABLES).map(([k, t]) => [k, columnsOf(t)])) as Record<
  PullTable,
  { key: string; name: string }[]
>;

/** Fila SQL (snake_case) → objeto (camelCase) según el esquema. */
export function fromRow<T>(table: SQLiteTable, row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const { key, name } of columnsOf(table)) out[key] = row[name];
  return out as T;
}

export type Farm = typeof s.farms.$inferSelect;
export type Plot = typeof s.plots.$inferSelect;
export type Poi = typeof s.pointsOfInterest.$inferSelect;
export type Task = typeof s.tasks.$inferSelect;
export type RecordRow = typeof s.records.$inferSelect & { pending: boolean; rejected: string | null; photos: number; voice: number };
export type Alert = typeof s.alerts.$inferSelect;
export type FarmLayer = typeof s.farmLayers.$inferSelect;
export type Season = typeof s.seasons.$inferSelect;
export type Product = typeof s.products.$inferSelect;
export type Machine = typeof s.machines.$inferSelect;
export type PlotSeason = typeof s.plotSeasons.$inferSelect;

export interface NewRecord {
  farmId: string;
  plotId: string | null;
  poiId: string | null;
  kind: RecordKind;
  data: Record<string, unknown>;
  lon: number | null;
  lat: number | null;
  gpsAccuracyM: number | null;
  capturedAt: number;
}

/** Nota de voz grabada en el celular (F-09): un .m4a local, sin miniatura. */
export interface LocalAudio {
  uri: string;
  bytes: number;
}

export interface LocalPhoto {
  photoUri: string;
  thumbUri: string;
  width: number;
  height: number;
  bytes: number;
}

/** Una cosa pendiente de mandar, tal como la ve la persona (pantalla Más). */
export interface OutboxItem {
  id: string;
  /** Qué es: un registro nuevo o editado, un borrado, una tarea hecha, o solo fotos. */
  what: "record" | "record_delete" | "task" | "photos" | "poi";
  recordKind: RecordKind | null;
  plotId: string | null;
  at: number;
  photos: number;
  photoBytes: number;
}

export class LocalDb implements SyncStore {
  constructor(
    readonly sql: Sql,
    private readonly now: () => number = Date.now,
  ) {}

  /** Incremental: user_version guarda cuántas sentencias del esquema del servidor ya se aplicaron. */
  migrate(): void {
    const applied = this.sql.get<{ user_version: number }>("PRAGMA user_version")?.user_version ?? 0;
    this.sql.tx(() => {
      for (const stmt of SERVER_SCHEMA.slice(applied)) this.sql.run(stmt);
      for (const stmt of LOCAL_SCHEMA) this.sql.run(stmt);
      if (SERVER_SCHEMA.length > applied) this.sql.run(`PRAGMA user_version = ${SERVER_SCHEMA.length}`);
    });
  }

  // ---------- kv ----------

  getKv(key: string): string | null {
    return this.sql.get<{ value: string }>("SELECT value FROM kv WHERE key = ?", [key])?.value ?? null;
  }

  setKv(key: string, value: string | null): void {
    if (value === null) this.sql.run("DELETE FROM kv WHERE key = ?", [key]);
    else
      this.sql.run("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
        key,
        value,
      ]);
  }

  // ---------- SyncStore ----------

  async pendingMutations(limit: number): Promise<Mutation[]> {
    return this.sql
      .all<{ payload: string }>(
        "SELECT payload FROM outbox WHERE rejected_reason IS NULL ORDER BY mutation_id LIMIT ?",
        [limit],
      )
      .map((r) => JSON.parse(r.payload) as Mutation);
  }

  async removeMutations(ids: string[]): Promise<void> {
    this.sql.tx(() => {
      for (const id of ids) this.sql.run("DELETE FROM outbox WHERE mutation_id = ?", [id]);
    });
  }

  async markRejected(rejections: { mutationId: string; reason: RejectReason; detail?: string }[]): Promise<void> {
    this.sql.tx(() => {
      for (const r of rejections)
        this.sql.run("UPDATE outbox SET rejected_reason = ?, rejected_detail = ? WHERE mutation_id = ?", [
          r.reason,
          r.detail ?? null,
          r.mutationId,
        ]);
    });
  }

  async getCursor(table: PullTable): Promise<Cursor | null> {
    const c = this.sql.get<{ version: number; id: string }>("SELECT version, id FROM sync_cursors WHERE tbl = ?", [
      table,
    ]);
    return c ? { version: c.version, id: c.id } : null;
  }

  async applyPull(table: PullTable, rows: Record<string, unknown>[], cursor: Cursor | null): Promise<void> {
    const cols = COLS[table];
    const names = cols.map((c) => c.name);
    const insert = `INSERT INTO ${table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})
      ON CONFLICT(id) DO UPDATE SET ${names
        .filter((n) => n !== "id")
        .map((n) => `${n} = excluded.${n}`)
        .join(", ")}`;
    this.sql.tx(() => {
      for (const row of rows) {
        if (this.hasPending(String(row.id))) continue;
        this.sql.run(
          insert,
          cols.map((c) => (row[c.key] === undefined ? null : (row[c.key] as Param))),
        );
      }
      if (cursor) {
        this.sql.run(
          "INSERT INTO sync_cursors (tbl, version, id) VALUES (?, ?, ?) ON CONFLICT(tbl) DO UPDATE SET version = excluded.version, id = excluded.id",
          [table, cursor.version, cursor.id],
        );
      }
    });
  }

  async getAssignmentsVersion(): Promise<number | null> {
    const v = this.getKv("assignments_version");
    return v === null ? null : Number(v);
  }

  async setAssignmentsVersion(v: number): Promise<void> {
    this.setKv("assignments_version", String(v));
  }

  async resetTables(tables: readonly PullTable[]): Promise<void> {
    this.sql.tx(() => {
      for (const t of tables) {
        this.sql.run(`DELETE FROM ${t} WHERE id NOT IN (SELECT row_id FROM outbox)`);
        this.sql.run("DELETE FROM sync_cursors WHERE tbl = ?", [t]);
      }
    });
  }

  private hasPending(rowId: string): boolean {
    return !!this.sql.get("SELECT 1 FROM outbox WHERE row_id = ? AND rejected_reason IS NULL LIMIT 1", [rowId]);
  }

  private enqueue(m: Mutation, rowId: string): void {
    this.sql.run("INSERT INTO outbox (mutation_id, kind, row_id, payload, created_at) VALUES (?, ?, ?, ?, ?)", [
      m.mutationId,
      m.kind,
      rowId,
      JSON.stringify(m),
      this.now(),
    ]);
  }

  // ---------- Escrituras offline ----------

  /** Guarda un registro con sus fotos. Todo en una transacción con sus mutaciones. */
  saveRecord(userId: string, orgId: string, input: NewRecord, photos: LocalPhoto[] = [], recordId = newId(), audio: LocalAudio | null = null): string {
    if (photos.length > LIMITS.photos.maxPerRecord) throw new Error("too_many_attachments");
    if (audio && audio.bytes > LIMITS.audio.maxBytes) throw new Error("audio_too_big");
    const ts = this.now();
    const existing = this.sql.get<{ created_at: number }>("SELECT created_at FROM records WHERE id = ?", [recordId]);
    this.sql.tx(() => {
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
      this.sql.run(
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
          existing?.created_at ?? ts,
          ts,
        ],
      );
      this.enqueue({ mutationId: newId(), kind: "records.upsert", row }, recordId);
      for (const p of photos) {
        const id = newId();
        this.sql.run(
          `INSERT INTO attachments (id, organization_id, record_id, storage_path, thumb_path, mime, width, height, bytes, upload_status, created_at, updated_at, version)
           VALUES (?, ?, ?, '', '', 'image/webp', ?, ?, ?, 'pending', ?, ?, 0)`,
          [id, orgId, recordId, p.width, p.height, p.bytes, ts, ts],
        );
        this.sql.run("INSERT INTO local_files (attachment_id, photo_uri, thumb_uri) VALUES (?, ?, ?)", [
          id,
          p.photoUri,
          p.thumbUri,
        ]);
        this.enqueue(
          {
            mutationId: newId(),
            kind: "attachments.upsert",
            row: { id, recordId, mime: "image/webp", width: p.width, height: p.height, bytes: p.bytes },
          },
          id,
        );
      }
      if (audio) {
        const id = newId();
        this.sql.run(
          `INSERT INTO attachments (id, organization_id, record_id, storage_path, thumb_path, mime, width, height, bytes, upload_status, created_at, updated_at, version)
           VALUES (?, ?, ?, '', '', ?, NULL, NULL, ?, 'pending', ?, ?, 0)`,
          [id, orgId, recordId, LIMITS.audio.mime, audio.bytes, ts, ts],
        );
        this.sql.run("INSERT INTO local_files (attachment_id, photo_uri, thumb_uri) VALUES (?, ?, '')", [id, audio.uri]);
        this.enqueue(
          { mutationId: newId(), kind: "attachments.upsert", row: { id, recordId, mime: LIMITS.audio.mime, width: null, height: null, bytes: audio.bytes } },
          id,
        );
      }
    });
    return recordId;
  }

  /**
   * Un registro por lote, todo en una transacción y con el mismo capturedAt (anotar en varios lotes, F-10).
   * Las fotos van en el primero: subirlas una vez por lote sería mandar lo mismo varias veces.
   */
  saveRecords(userId: string, orgId: string, inputs: NewRecord[], photos: LocalPhoto[] = [], audio: LocalAudio | null = null): string[] {
    return this.sql.tx(() => inputs.map((input, i) => this.saveRecord(userId, orgId, input, i === 0 ? photos : [], undefined, i === 0 ? audio : null)));
  }

  /** Marca un punto de interés (F-07). Fila local + mutación en una sola transacción. */
  savePoi(orgId: string, input: { farmId: string; kind: Poi["kind"]; name: string; lon: number; lat: number }, poiId = newId()): string {
    const ts = this.now();
    const name = input.name.trim();
    this.sql.tx(() => {
      this.sql.run(
        `INSERT INTO points_of_interest (id, organization_id, farm_id, kind, name, lon, lat, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name, lon = excluded.lon, lat = excluded.lat, updated_at = excluded.updated_at`,
        [poiId, orgId, input.farmId, input.kind, name, input.lon, input.lat, ts, ts],
      );
      this.enqueue({ mutationId: newId(), kind: "pois.upsert", row: { id: poiId, farmId: input.farmId, kind: input.kind, name, lon: input.lon, lat: input.lat } }, poiId);
    });
    return poiId;
  }

  deleteRecord(recordId: string): void {
    const ts = this.now();
    this.sql.tx(() => {
      this.sql.run("UPDATE records SET deleted_at = ?, updated_at = ? WHERE id = ?", [ts, ts, recordId]);
      this.enqueue({ mutationId: newId(), kind: "records.delete", row: { id: recordId } }, recordId);
    });
  }

  /** Marca la tarea hecha y, si se repite, crea la siguiente con el mismo id que creará el servidor. */
  completeTask(taskId: string, recordId: string | null): void {
    const t = this.sql.get<Record<string, unknown>>("SELECT * FROM tasks WHERE id = ?", [taskId]);
    if (!t) throw new Error("task_not_found");
    const task = fromRow<Task>(s.tasks, t);
    const ts = this.now();
    const tz =
      this.sql.get<{ timezone: string }>("SELECT timezone FROM farms WHERE id = ?", [task.farmId])?.timezone ??
      "America/Asuncion";
    this.sql.tx(() => {
      this.sql.run("UPDATE tasks SET status = 'done', completed_at = ?, record_id = ?, updated_at = ? WHERE id = ?", [
        ts,
        recordId,
        ts,
        taskId,
      ]);
      this.enqueue(
        { mutationId: newId(), kind: "tasks.status", row: { id: taskId, status: "done", completedAt: ts, recordId } },
        taskId,
      );
      const next = task.status !== "done" ? nextDueDate(task.dueDate, task.recurrence, localDate(ts, tz)) : null;
      if (next) {
        this.sql.run(
          `INSERT INTO tasks (id, organization_id, farm_id, plot_id, assignee_id, title, kind, lon, lat, due_date, due_time, priority, recurrence, status, prescription, created_by, created_at, updated_at, version, checklist, work_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, 0, ?, ?) ON CONFLICT(id) DO NOTHING`,
          [
            nextOccurrenceId(taskId),
            task.organizationId,
            task.farmId,
            task.plotId,
            task.assigneeId,
            task.title,
            task.kind,
            task.lon,
            task.lat,
            next,
            task.dueTime,
            task.priority,
            task.recurrence,
            task.prescription,
            task.createdBy,
            ts,
            ts,
            serializeChecklist(resetChecklist(parseChecklist(task.checklist))),
            task.workOrder,
          ],
        );
      }
    });
  }

  taskById(id: string): Task | null {
    const r = this.sql.get<Record<string, unknown>>("SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL", [id]);
    return r ? fromRow<Task>(s.tasks, r) : null;
  }

  /** Tilda o destilda un ítem de la lista de verificación (F-15). Sin red: queda en el outbox. */
  setChecklistItem(taskId: string, itemId: string, done: boolean): void {
    const task = this.taskById(taskId);
    if (!task) throw new Error("task_not_found");
    const next = setChecklistItem(parseChecklist(task.checklist), itemId, done);
    if (!next) throw new Error("item_not_found");
    const ts = this.now();
    this.sql.tx(() => {
      this.sql.run("UPDATE tasks SET checklist = ?, updated_at = ? WHERE id = ?", [serializeChecklist(next), ts, taskId]);
      this.enqueue({ mutationId: newId(), kind: "tasks.check", row: { id: taskId, itemId, done } }, taskId);
    });
  }

  // ---------- Lecturas para la UI ----------

  pendingCount(): number {
    return this.sql.get<{ n: number }>("SELECT count(*) n FROM outbox WHERE rejected_reason IS NULL")?.n ?? 0;
  }

  /**
   * Lo que falta mandar: mutaciones del outbox (cada registro con el peso de sus fotos) y fotos que
   * el servidor ya conoce pero todavía no se subieron. Más viejo primero.
   */
  outboxItems(): OutboxItem[] {
    const rows = this.sql.all<{ mutation_id: string; payload: string; created_at: number }>(
      "SELECT mutation_id, payload, created_at FROM outbox WHERE rejected_reason IS NULL ORDER BY mutation_id",
    );
    const muts = rows.map((r) => ({ m: JSON.parse(r.payload) as Mutation, at: r.created_at }));
    // Fotos por registro: las que van en el outbox y las que esperan subir.
    const photosOf = new Map<string, { n: number; bytes: number; at: number }>();
    const addPhoto = (recordId: string, bytes: number, at: number) => {
      const p = photosOf.get(recordId) ?? { n: 0, bytes: 0, at };
      photosOf.set(recordId, { n: p.n + 1, bytes: p.bytes + bytes, at: Math.min(p.at, at) });
    };
    for (const { m, at } of muts) if (m.kind === "attachments.upsert") addPhoto(m.row.recordId, m.row.bytes ?? 0, at);
    for (const f of this.sql.all<{ record_id: string; bytes: number | null; created_at: number }>(
      `SELECT a.record_id, a.bytes, a.created_at FROM local_files f JOIN attachments a ON a.id = f.attachment_id
       WHERE f.uploaded = 0 AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.row_id = f.attachment_id)`,
    ))
      addPhoto(f.record_id, f.bytes ?? 0, f.created_at);

    const items: OutboxItem[] = [];
    const withRecord = new Set<string>();
    for (const { m, at } of muts) {
      if (m.kind === "records.upsert") {
        const p = photosOf.get(m.row.id);
        withRecord.add(m.row.id);
        items.push({ id: m.mutationId, what: "record", recordKind: m.row.kind, plotId: m.row.plotId, at, photos: p?.n ?? 0, photoBytes: p?.bytes ?? 0 });
      } else if (m.kind === "records.delete") {
        items.push({ id: m.mutationId, what: "record_delete", recordKind: null, plotId: null, at, photos: 0, photoBytes: 0 });
      } else if (m.kind === "pois.upsert") {
        items.push({ id: m.mutationId, what: "poi", recordKind: null, plotId: null, at, photos: 0, photoBytes: 0 });
      } else if (m.kind === "tasks.status" || m.kind === "tasks.check") {
        items.push({ id: m.mutationId, what: "task", recordKind: null, plotId: null, at, photos: 0, photoBytes: 0 });
      }
    }
    // Fotos de registros que ya llegaron al servidor.
    for (const [recordId, p] of photosOf) {
      if (withRecord.has(recordId)) continue;
      const rec = this.sql.get<{ kind: RecordKind; plot_id: string | null }>("SELECT kind, plot_id FROM records WHERE id = ?", [recordId]);
      items.push({ id: `photos-${recordId}`, what: "photos", recordKind: rec?.kind ?? null, plotId: rec?.plot_id ?? null, at: p.at, photos: p.n, photoBytes: p.bytes });
    }
    return items.sort((a, b) => a.at - b.at);
  }

  rejected(): { mutationId: string; kind: string; reason: string; detail: string | null }[] {
    return this.sql.all(
      "SELECT mutation_id mutationId, kind, rejected_reason reason, rejected_detail detail FROM outbox WHERE rejected_reason IS NOT NULL",
    );
  }

  dismissRejected(mutationId: string): void {
    this.sql.run("DELETE FROM outbox WHERE mutation_id = ?", [mutationId]);
  }

  farms(): Farm[] {
    return this.sql
      .all("SELECT * FROM farms WHERE deleted_at IS NULL ORDER BY name")
      .map((r) => fromRow<Farm>(s.farms, r));
  }

  plots(farmId?: string): Plot[] {
    return this.sql
      .all(
        "SELECT * FROM plots WHERE deleted_at IS NULL" + (farmId ? " AND farm_id = ?" : "") + " ORDER BY name",
        farmId ? [farmId] : [],
      )
      .map((r) => fromRow<Plot>(s.plots, r));
  }

  pois(farmId?: string): Poi[] {
    return this.sql
      .all(
        "SELECT * FROM points_of_interest WHERE deleted_at IS NULL" + (farmId ? " AND farm_id = ?" : ""),
        farmId ? [farmId] : [],
      )
      .map((r) => fromRow<Poi>(s.pointsOfInterest, r));
  }

  tasksToday(userId: string, today = localDate(this.now())): Task[] {
    return this.sql
      .all("SELECT * FROM tasks WHERE assignee_id = ? AND deleted_at IS NULL ORDER BY due_date, title", [userId])
      .map((r) => fromRow<Task>(s.tasks, r))
      .filter((t) => isDueToday(t, today) || (t.status === "done" && localDate(t.completedAt ?? 0) === today));
  }

  /** Tareas abiertas con punto en el mapa (S-09), para dibujarlas y llevar a la persona ahí. */
  taskPoints(userId: string): { id: string; title: string; lon: number; lat: number }[] {
    return this.sql
      .all<{ id: string; title: string; lon: number; lat: number }>(
        "SELECT id, title, lon, lat FROM tasks WHERE assignee_id = ? AND status = 'open' AND deleted_at IS NULL AND lon IS NOT NULL AND lat IS NOT NULL",
        [userId],
      );
  }

  records(limit = 200): RecordRow[] {
    const since = this.now() - LIMITS.sync.recordsHistoryMs;
    return this.sql
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
  recordById(id: string): RecordRow | null {
    return this.records(500).find((r) => r.id === id) ?? null;
  }

  /** Fotos del registro; `thumbUri` es null si la miniatura no está en este celular. */
  photosOfRecord(recordId: string): { id: string; thumbUri: string | null }[] {
    return this.sql
      .all<{ id: string }>("SELECT id FROM attachments WHERE record_id = ? AND deleted_at IS NULL AND mime NOT LIKE 'audio/%' ORDER BY created_at", [recordId])
      .map((a) => ({ id: a.id, thumbUri: this.localPhoto(a.id) }));
  }

  /** Nota de voz del registro (F-09): archivo local si está en este celular, y si ya se subió. */
  voiceOfRecord(recordId: string): { id: string; uri: string | null; uploaded: boolean }[] {
    return this.sql
      .all<{ id: string; upload_status: string }>(
        "SELECT id, upload_status FROM attachments WHERE record_id = ? AND deleted_at IS NULL AND mime LIKE 'audio/%' ORDER BY created_at",
        [recordId],
      )
      .map((a) => ({
        id: a.id,
        uri: this.sql.get<{ photo_uri: string }>("SELECT photo_uri FROM local_files WHERE attachment_id = ?", [a.id])?.photo_uri || null,
        uploaded: a.upload_status === "uploaded",
      }));
  }

  /** Primera miniatura local de cada registro con fotos (Historial). Las fotos de otro celular no tienen miniatura acá. */
  firstThumbByRecord(): Map<string, string> {
    const rows = this.sql.all<{ record_id: string; thumb_uri: string }>(
      `SELECT a.record_id, f.thumb_uri FROM attachments a JOIN local_files f ON f.attachment_id = a.id
       WHERE a.deleted_at IS NULL AND a.mime NOT LIKE 'audio/%' ORDER BY a.created_at DESC, a.rowid DESC`,
    );
    // Se recorre de la más nueva a la más vieja: la última escritura en el mapa es la primera foto.
    return new Map(rows.map((r) => [r.record_id, r.thumb_uri] as const));
  }

  /** Últimas anotaciones de un lote (ficha del lote y pantalla Anotar). */
  recordsOfPlot(plotId: string, limit = 20): RecordRow[] {
    return this.records(500).filter((r) => r.plotId === plotId).slice(0, limit);
  }

  /**
   * Hacienda actual de un potrero, calculada con lo que hay en el celular (ADR 0004): último conteo más
   * movimientos y mortandad posteriores. Funciona sin señal. `null` si el potrero nunca tuvo datos de hacienda.
   */
  herdStock(plotId: string): PlotStock | null {
    const rows = this.sql.all<{ kind: string; plot_id: string | null; captured_at: number; data: string }>(
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
  rainThisMonth(farmId: string, now = this.now()): number {
    const d = new Date(now - 3 * 3_600_000);
    const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + 3 * 3_600_000;
    const rows = this.sql.all<{ data: string }>(
      "SELECT data FROM records WHERE farm_id = ? AND kind = 'rain' AND deleted_at IS NULL AND captured_at >= ?",
      [farmId, from],
    );
    return rows.reduce((a, r) => a + (Number((JSON.parse(r.data) as { mm?: number }).mm) || 0), 0);
  }

  /** Último NDVI del lote según lo que bajó al celular; null si no hay (empleados no reciben estadísticas). */
  lastVigor(plotId: string): { mean: number; acquiredAt: number } | null {
    const r = this.sql.get<{ mean: number; acquired_at: number }>(
      "SELECT mean, acquired_at FROM plot_index_stats WHERE plot_id = ? AND idx = 'ndvi' AND deleted_at IS NULL ORDER BY acquired_at DESC LIMIT 1",
      [plotId],
    );
    return r ? { mean: r.mean, acquiredAt: r.acquired_at } : null;
  }

  /** Las dos últimas pasadas de NDVI de cada lote, para ver cuáles empeoraron (F-29). */
  lastTwoVigorPasses(): { plotId: string; mean: number; acquiredAt: number }[] {
    return this.sql
      .all<{ plot_id: string; mean: number; acquired_at: number }>(
        `SELECT plot_id, mean, acquired_at FROM (
           SELECT plot_id, mean, acquired_at,
                  ROW_NUMBER() OVER (PARTITION BY plot_id ORDER BY acquired_at DESC) AS rn
           FROM plot_index_stats WHERE idx = 'ndvi' AND deleted_at IS NULL
         ) WHERE rn <= 2`,
      )
      .map((r) => ({ plotId: r.plot_id, mean: r.mean, acquiredAt: r.acquired_at }));
  }

  /** Tareas abiertas de un lote. */
  openTasksOfPlot(plotId: string): number {
    return this.sql.get<{ n: number }>("SELECT count(*) n FROM tasks WHERE plot_id = ? AND status = 'open' AND deleted_at IS NULL", [plotId])?.n ?? 0;
  }

  /** Último registro por lote, para saber qué lotes hace días que nadie recorre. */
  lastVisitByPlot(): Map<string, number> {
    const rows = this.sql.all<{ plot_id: string; last: number }>(
      "SELECT plot_id, max(captured_at) AS last FROM records WHERE plot_id IS NOT NULL AND deleted_at IS NULL GROUP BY plot_id",
    );
    return new Map(rows.map((r) => [r.plot_id, r.last]));
  }

  activeAlerts(): Alert[] {
    return this.sql
      .all(
        "SELECT * FROM alerts WHERE resolved_at IS NULL AND (valid_to IS NULL OR valid_to >= ?) ORDER BY valid_from",
        [this.now()],
      )
      .map((r) => fromRow<Alert>(s.alerts, r));
  }

  /** Receta de una tarea (A-11), ya validada; null si no tiene o está dañada. */
  prescriptionOf(taskId: string): Prescription | null {
    const r = this.sql.get<{ prescription: string | null }>("SELECT prescription FROM tasks WHERE id = ?", [taskId]);
    if (!r?.prescription) return null;
    try {
      const p = prescriptionSchema.safeParse(JSON.parse(r.prescription));
      return p.success ? p.data : null;
    } catch {
      return null;
    }
  }

  /** Orden de trabajo de una tarea (E-20), ya validada; null si no tiene o está dañada. */
  orderOf(taskId: string): WorkOrder | null {
    const r = this.sql.get<{ work_order: string | null }>("SELECT work_order FROM tasks WHERE id = ?", [taskId]);
    if (!r?.work_order) return null;
    try {
      const p = orderSchema.safeParse(JSON.parse(r.work_order));
      return p.success ? p.data : null;
    } catch {
      return null;
    }
  }

  /** Campañas activas de la organización, la más reciente primero. */
  activeSeasons(): Season[] {
    return this.sql
      .all("SELECT * FROM seasons WHERE deleted_at IS NULL AND active = 1 ORDER BY start_date DESC, created_at DESC")
      .map((r) => fromRow<Season>(s.seasons, r));
  }

  /** Catálogo de productos de la organización. */
  products(): Product[] {
    return this.sql
      .all("SELECT * FROM products WHERE deleted_at IS NULL ORDER BY name")
      .map((r) => fromRow<Product>(s.products, r));
  }

  /** Maquinaria y vehículos de la organización (para cargar combustible). */
  machines(): Machine[] {
    return this.sql
      .all("SELECT * FROM machines WHERE deleted_at IS NULL ORDER BY name")
      .map((r) => fromRow<Machine>(s.machines, r));
  }

  /** Lo planificado en un lote para una campaña (cultivo, variedad), si bajó al celular. */
  plotSeason(plotId: string, seasonId: string): PlotSeason | null {
    const r = this.sql.get(
      "SELECT * FROM plot_seasons WHERE plot_id = ? AND season_id = ? AND deleted_at IS NULL",
      [plotId, seasonId],
    );
    return r ? fromRow<PlotSeason>(s.plotSeasons, r) : null;
  }

  latestLayers(farmId: string): FarmLayer[] {
    return this.sql
      .all(
        `SELECT l.* FROM farm_layers l WHERE l.farm_id = ? AND l.deleted_at IS NULL
         AND l.acquired_at = (SELECT max(acquired_at) FROM farm_layers x WHERE x.farm_id = l.farm_id AND x.layer = l.layer AND x.deleted_at IS NULL)`,
        [farmId],
      )
      .map((r) => fromRow<FarmLayer>(s.farmLayers, r));
  }

  // ---------- Fotos pendientes de subir ----------

  pendingUploads(): { attachmentId: string; photoUri: string; thumbUri: string; attempts: number; mime: string }[] {
    // Solo las que el servidor ya conoce (su mutación salió del outbox).
    return this.sql.all(
      `SELECT f.attachment_id attachmentId, f.photo_uri photoUri, f.thumb_uri thumbUri, f.attempts, a.mime FROM local_files f
       JOIN attachments a ON a.id = f.attachment_id
       WHERE f.uploaded = 0 AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.row_id = f.attachment_id)`,
    );
  }

  markUploaded(attachmentId: string, ok: boolean): void {
    if (ok) this.sql.run("UPDATE local_files SET uploaded = 1 WHERE attachment_id = ?", [attachmentId]);
    else this.sql.run("UPDATE local_files SET attempts = attempts + 1 WHERE attachment_id = ?", [attachmentId]);
  }

  /** Cuánto ocupa lo local que se puede medir sin tocar el disco (F-19): fotos y notas ya cargadas, mapas bajados. */
  storageSummary(): { photos: { n: number; bytes: number }; voice: { n: number; bytes: number }; maps: { n: number; bytes: number }; reclaimable: { n: number; bytes: number } } {
    const sum = (where: string) =>
      this.sql.get<{ n: number; bytes: number }>(
        `SELECT count(*) n, coalesce(sum(a.bytes), 0) bytes FROM local_files f JOIN attachments a ON a.id = f.attachment_id WHERE f.photo_uri <> '' AND ${where}`,
      ) ?? { n: 0, bytes: 0 };
    const maps = this.sql.get<{ n: number; bytes: number }>("SELECT count(*) n, coalesce(sum(bytes), 0) bytes FROM offline_packs") ?? { n: 0, bytes: 0 };
    return {
      photos: sum("a.mime NOT LIKE 'audio/%'"),
      voice: sum("a.mime LIKE 'audio/%'"),
      maps,
      reclaimable: sum("f.uploaded = 1"),
    };
  }

  /** Archivos grandes (foto completa o nota de voz) cuyo original ya está en el servidor: se pueden borrar del celular. */
  uploadedFiles(): { attachmentId: string; uri: string; bytes: number }[] {
    return this.sql.all(
      `SELECT f.attachment_id attachmentId, f.photo_uri uri, coalesce(a.bytes, 0) bytes FROM local_files f
       JOIN attachments a ON a.id = f.attachment_id
       WHERE f.uploaded = 1 AND f.photo_uri <> '' AND a.upload_status = 'uploaded'
         AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.row_id = f.attachment_id)`,
    );
  }

  /** Después de borrar los archivos: la fila queda sin ruta (la miniatura se conserva) y se ve desde el servidor. */
  clearUploadedFiles(attachmentIds: string[]): void {
    this.sql.tx(() => {
      for (const id of attachmentIds) this.sql.run("UPDATE local_files SET photo_uri = '' WHERE attachment_id = ? AND uploaded = 1", [id]);
    });
  }

  localPhoto(attachmentId: string): string | null {
    return (
      this.sql.get<{ thumb_uri: string }>("SELECT thumb_uri FROM local_files WHERE attachment_id = ?", [attachmentId])
        ?.thumb_uri ?? null
    );
  }

  /** Cierra la sesión: borra todo lo local salvo lo que no se subió (no se pierde nada). */
  wipeSynced(): void {
    this.sql.tx(() => {
      for (const t of Object.keys(TABLES)) this.sql.run(`DELETE FROM ${t} WHERE id NOT IN (SELECT row_id FROM outbox)`);
      this.sql.run("DELETE FROM sync_cursors");
      this.sql.run("DELETE FROM kv WHERE key = 'assignments_version'");
    });
  }

  tableName(t: SQLiteTable): string {
    return getTableName(t);
  }
}
