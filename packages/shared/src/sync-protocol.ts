/**
 * Contrato de sincronización (PRD §11 con ajustes de PRD-cloudflare §4.3).
 * Push: lote ≤ LIMITS.sync.maxMutationsPerPush de mutaciones idempotentes (mutationId UUIDv7).
 * Pull: por tabla, paginado con cursor (version, id) que asigna el servidor.
 */
import { z } from "zod";
import { LIMITS } from "./limits";
import { POI_KINDS, RECORD_KINDS, TASK_STATUS } from "./schema";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "uuid inválido");
const epochMs = z.number().int().nonnegative();
const lon = z.number().min(-180).max(180);
const lat = z.number().min(-90).max(90);

export const recordRow = z.object({
  id: uuid,
  farmId: uuid,
  plotId: uuid.nullable(),
  poiId: uuid.nullable(),
  kind: z.enum(RECORD_KINDS),
  /** Se valida con recordDataSchemas[kind] en el servidor. */
  data: z.unknown(),
  schemaVersion: z.number().int().positive(),
  lon: lon.nullable(),
  lat: lat.nullable(),
  gpsAccuracyM: z.number().nonnegative().max(100_000).nullable(),
  capturedAt: epochMs,
});

export const attachmentRow = z.object({
  id: uuid,
  recordId: uuid,
  mime: z.literal("image/webp"),
  width: z.number().int().positive().max(LIMITS.photos.maxLongSidePx).nullable(),
  height: z.number().int().positive().max(LIMITS.photos.maxLongSidePx).nullable(),
  bytes: z.number().int().positive().max(LIMITS.photos.maxBytes).nullable(),
});

/** Desde el celular las tareas solo cambian de estado (PRD §11). */
export const taskStatusRow = z.object({
  id: uuid,
  status: z.enum(TASK_STATUS),
  completedAt: epochMs.nullable(),
  recordId: uuid.nullable(),
});

const base = { mutationId: uuid };
const del = z.object({ id: uuid });

export const mutation = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("records.upsert"), row: recordRow }),
  z.object({ ...base, kind: z.literal("records.delete"), row: del }),
  z.object({ ...base, kind: z.literal("attachments.upsert"), row: attachmentRow }),
  z.object({ ...base, kind: z.literal("attachments.delete"), row: del }),
  z.object({ ...base, kind: z.literal("tasks.status"), row: taskStatusRow }),
]);
export type Mutation = z.infer<typeof mutation>;
export type MutationKind = Mutation["kind"];

export const pushRequest = z.object({
  deviceId: z.string().min(1).max(64),
  mutations: z.array(mutation).min(1).max(LIMITS.sync.maxMutationsPerPush),
});
export type PushRequest = z.infer<typeof pushRequest>;

export type RejectReason =
  "not_found" | "forbidden" | "invalid" | "edit_window_expired" | "too_many_attachments" | "deleted";

export type MutationResult =
  | { mutationId: string; status: "applied" | "duplicate" }
  | { mutationId: string; status: "rejected"; reason: RejectReason; detail?: string };

export interface PushResponse {
  results: MutationResult[];
}

/** Tablas que bajan al celular, en orden de aplicación. */
export const PULL_TABLES = [
  "farms",
  "plots",
  "points_of_interest",
  "plot_assignments",
  "tasks",
  "records",
  "attachments",
  "alerts",
  "plot_index_stats",
  "farm_layers",
] as const;
export type PullTable = (typeof PULL_TABLES)[number];

/** Tablas que dependen de las asignaciones del empleado: se rehacen si cambian. */
export const ASSIGNMENT_SCOPED_TABLES: readonly PullTable[] = [
  "farms",
  "plots",
  "points_of_interest",
  "plot_assignments",
  "records",
  "attachments",
  "alerts",
  "farm_layers",
];

export const cursor = z.object({ version: z.number().int().nonnegative(), id: z.string() });
export type Cursor = z.infer<typeof cursor>;

export const pullRequest = z.object({
  table: z.enum(PULL_TABLES),
  cursor: cursor.nullable(),
});
export type PullRequest = z.infer<typeof pullRequest>;

export interface PullResponse<Row = Record<string, unknown>> {
  table: PullTable;
  rows: Row[];
  /** Cursor de la última fila devuelta; null si no hubo filas. */
  cursor: Cursor | null;
  hasMore: boolean;
}

/** GET /sync/state: se consulta al inicio de cada ciclo. */
export interface SyncState {
  userId: string;
  organizationId: string;
  role: string;
  assignmentsVersion: number;
  serverTime: number;
}

export { POI_KINDS };
