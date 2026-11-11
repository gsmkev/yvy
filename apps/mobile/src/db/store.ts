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
  isDueToday,
  LIMITS,
  localDate,
  newId,
  nextDueDate,
  nextOccurrenceId,
  RECORD_SCHEMA_VERSION,
  type Cursor,
  type Mutation,
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
export type RecordRow = typeof s.records.$inferSelect & { pending: boolean; rejected: string | null; photos: number };
export type Alert = typeof s.alerts.$inferSelect;
export type FarmLayer = typeof s.farmLayers.$inferSelect;

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
  saveRecord(userId: string, orgId: string, input: NewRecord, photos: LocalPhoto[] = [], recordId = newId()): string {
    if (photos.length > LIMITS.photos.maxPerRecord) throw new Error("too_many_attachments");
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
    });
    return recordId;
  }

  /**
   * Un registro por lote, todo en una transacción y con el mismo capturedAt (anotar en varios lotes, F-10).
   * Las fotos van en el primero: subirlas una vez por lote sería mandar lo mismo varias veces.
   */
  saveRecords(userId: string, orgId: string, inputs: NewRecord[], photos: LocalPhoto[] = []): string[] {
    return this.sql.tx(() => inputs.map((input, i) => this.saveRecord(userId, orgId, input, i === 0 ? photos : [])));
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
          `INSERT INTO tasks (id, organization_id, farm_id, plot_id, assignee_id, title, kind, due_date, recurrence, status, created_by, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, 0) ON CONFLICT(id) DO NOTHING`,
          [
            nextOccurrenceId(taskId),
            task.organizationId,
            task.farmId,
            task.plotId,
            task.assigneeId,
            task.title,
            task.kind,
            next,
            task.recurrence,
            task.createdBy,
            ts,
            ts,
          ],
        );
      }
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
      } else if (m.kind === "tasks.status") {
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

  records(limit = 200): RecordRow[] {
    const since = this.now() - LIMITS.sync.recordsHistoryMs;
    return this.sql
      .all(
        `SELECT r.*,
          EXISTS (SELECT 1 FROM outbox o WHERE o.rejected_reason IS NULL AND (o.row_id = r.id OR o.row_id IN (SELECT id FROM attachments WHERE record_id = r.id))) AS _pending,
          (SELECT rejected_reason FROM outbox o WHERE o.row_id = r.id AND o.rejected_reason IS NOT NULL LIMIT 1) AS _rejected,
          (SELECT count(*) FROM attachments a WHERE a.record_id = r.id AND a.deleted_at IS NULL) AS _photos
         FROM records r WHERE r.deleted_at IS NULL AND r.captured_at >= ? ORDER BY r.captured_at DESC LIMIT ?`,
        [since, limit],
      )
      .map((r) => ({
        ...fromRow<typeof s.records.$inferSelect>(s.records, r),
        pending: !!r._pending,
        rejected: (r._rejected as string | null) ?? null,
        photos: Number(r._photos),
      }));
  }

  /** Un registro por id (ficha); null si no existe o fue borrado. */
  recordById(id: string): RecordRow | null {
    return this.records(500).find((r) => r.id === id) ?? null;
  }

  /** Fotos del registro; `thumbUri` es null si la miniatura no está en este celular. */
  photosOfRecord(recordId: string): { id: string; thumbUri: string | null }[] {
    return this.sql
      .all<{ id: string }>("SELECT id FROM attachments WHERE record_id = ? AND deleted_at IS NULL ORDER BY created_at", [recordId])
      .map((a) => ({ id: a.id, thumbUri: this.localPhoto(a.id) }));
  }

  /** Primera miniatura local de cada registro con fotos (Historial). Las fotos de otro celular no tienen miniatura acá. */
  firstThumbByRecord(): Map<string, string> {
    const rows = this.sql.all<{ record_id: string; thumb_uri: string }>(
      `SELECT a.record_id, f.thumb_uri FROM attachments a JOIN local_files f ON f.attachment_id = a.id
       WHERE a.deleted_at IS NULL ORDER BY a.created_at DESC, a.rowid DESC`,
    );
    // Se recorre de la más nueva a la más vieja: la última escritura en el mapa es la primera foto.
    return new Map(rows.map((r) => [r.record_id, r.thumb_uri] as const));
  }

  /** Últimas anotaciones de un lote (ficha del lote y pantalla Anotar). */
  recordsOfPlot(plotId: string, limit = 20): RecordRow[] {
    return this.records(500).filter((r) => r.plotId === plotId).slice(0, limit);
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

  pendingUploads(): { attachmentId: string; photoUri: string; thumbUri: string; attempts: number }[] {
    // Solo las que el servidor ya conoce (su mutación salió del outbox).
    return this.sql.all(
      `SELECT f.attachment_id attachmentId, f.photo_uri photoUri, f.thumb_uri thumbUri, f.attempts FROM local_files f
       WHERE f.uploaded = 0 AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.row_id = f.attachment_id)`,
    );
  }

  markUploaded(attachmentId: string, ok: boolean): void {
    if (ok) this.sql.run("UPDATE local_files SET uploaded = 1 WHERE attachment_id = ?", [attachmentId]);
    else this.sql.run("UPDATE local_files SET attempts = attempts + 1 WHERE attachment_id = ?", [attachmentId]);
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
