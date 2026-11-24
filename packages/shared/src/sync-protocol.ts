/**
 * Contrato de sincronización entre el celular y el Worker: mutaciones del push y filas del pull.
 * Push: lote ≤ LIMITS.sync.maxMutationsPerPush de mutaciones idempotentes (mutationId UUIDv7).
 * Pull: por tabla, paginado con cursor (version, id) que asigna el servidor.
 */
import { z } from "zod";
import { LIMITS } from "./limits";
import { CROPS, PLOT_KINDS, POI_KINDS, RECORD_KINDS, TASK_STATUS } from "./schema";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "uuid inválido");
const epochMs = z.number().int().nonnegative();
const lon = z.number().min(-180).max(180);
const lat = z.number().min(-90).max(90);

/** Registro de campo tal como viaja en el push y el pull. */
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

/** Tipos de adjunto: foto WebP (con miniatura) o nota de voz m4a. */
export const ATTACHMENT_MIMES = ["image/webp", LIMITS.audio.mime] as const;
/** ¿El tipo MIME es el de una nota de voz? */
export const isAudioMime = (mime: string): boolean => mime === LIMITS.audio.mime;

/** Adjunto (foto o nota de voz) de un registro. */
export const attachmentRow = z
  .object({
    id: uuid,
    recordId: uuid,
    mime: z.enum(ATTACHMENT_MIMES),
    width: z.number().int().positive().max(LIMITS.photos.maxLongSidePx).nullable(),
    height: z.number().int().positive().max(LIMITS.photos.maxLongSidePx).nullable(),
    bytes: z.number().int().positive().max(Math.max(LIMITS.photos.maxBytes, LIMITS.audio.maxBytes)).nullable(),
  })
  .refine((a) => a.bytes === null || a.bytes <= (isAudioMime(a.mime) ? LIMITS.audio.maxBytes : LIMITS.photos.maxBytes), {
    message: "Adjunto demasiado grande",
  });

/** Desde el celular las tareas solo cambian de estado. */
export const taskStatusRow = z.object({
  id: uuid,
  status: z.enum(TASK_STATUS),
  completedAt: epochMs.nullable(),
  recordId: uuid.nullable(),
});

/** Tilde de un ítem de la lista de verificación de una tarea. */
export const taskCheckRow = z.object({
  id: uuid,
  itemId: z.string().min(1).max(24),
  done: z.boolean(),
});

/** Comentario nuevo en una tarea. El id lo pone el celular; el nombre del autor lo pone el servidor. */
export const taskCommentRow = z.object({
  id: z.string().min(1).max(40),
  taskId: uuid,
  text: z.string().trim().min(1).max(LIMITS.tasks.maxCommentLength),
});

/** Punto de interés marcado desde el celular (solo roles que no son `worker`). */
export const poiRow = z.object({
  id: uuid,
  farmId: uuid,
  kind: z.enum(POI_KINDS),
  name: z.string().trim().min(1).max(LIMITS.sync.maxPoiNameLength),
  lon,
  lat,
});

/**
 * Lote dibujado o editado en el celular. La geometría es un Polígono GeoJSON; el servidor valida
 * la forma, calcula área y bbox y aplica el límite de hectáreas del plan. Solo roles que no son `worker`.
 */
export const plotRow = z.object({
  id: uuid,
  farmId: uuid,
  name: z.string().trim().min(1).max(120),
  kind: z.enum(PLOT_KINDS),
  crop: z.enum(CROPS).nullable(),
  geometry: z.unknown(),
});

/** Comentario con menciones; el servidor valida que los mencionados sean de la organización. */
export const commentRow = z.object({
  id: uuid,
  recordId: uuid,
  body: z.string().trim().min(1).max(LIMITS.comments.maxLength),
  mentions: z.array(uuid).max(LIMITS.comments.maxMentions).default([]),
});

const base = { mutationId: uuid };
const del = z.object({ id: uuid });

/** Mutación del push: una operación idempotente identificada por `mutationId`. */
export const mutation = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("records.upsert"), row: recordRow }),
  z.object({ ...base, kind: z.literal("records.delete"), row: del }),
  z.object({ ...base, kind: z.literal("attachments.upsert"), row: attachmentRow }),
  z.object({ ...base, kind: z.literal("attachments.delete"), row: del }),
  z.object({ ...base, kind: z.literal("tasks.status"), row: taskStatusRow }),
  z.object({ ...base, kind: z.literal("tasks.check"), row: taskCheckRow }),
  z.object({ ...base, kind: z.literal("tasks.comment"), row: taskCommentRow }),
  z.object({ ...base, kind: z.literal("pois.upsert"), row: poiRow }),
  z.object({ ...base, kind: z.literal("plots.upsert"), row: plotRow }),
  z.object({ ...base, kind: z.literal("comments.upsert"), row: commentRow }),
  z.object({ ...base, kind: z.literal("comments.delete"), row: del }),
]);
/** Mutación del push. */
export type Mutation = z.infer<typeof mutation>;
/** Tipo de mutación (por ejemplo `records.upsert`). */
export type MutationKind = Mutation["kind"];

/** Cuerpo del push: dispositivo y lote de mutaciones. */
export const pushRequest = z.object({
  deviceId: z.string().min(1).max(64),
  mutations: z.array(mutation).min(1).max(LIMITS.sync.maxMutationsPerPush),
});
/** Cuerpo del push. */
export type PushRequest = z.infer<typeof pushRequest>;

/** Motivo por el que el servidor rechaza una mutación. */
export type RejectReason =
  | "not_found"
  | "forbidden"
  | "invalid"
  | "edit_window_expired"
  | "too_many_attachments"
  | "deleted"
  | "captured_in_future"
  /** La tarea pide foto y/o ubicación en el registro con el que se cierra. */
  | "close_requirements";

/** Resultado de una mutación: aplicada, duplicada (ya aplicada antes) o rechazada. */
export type MutationResult =
  | { mutationId: string; status: "applied" | "duplicate" }
  | { mutationId: string; status: "rejected"; reason: RejectReason; detail?: string };

/** Respuesta del push: un resultado por mutación. */
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
  "seasons",
  "plot_seasons",
  "products",
  "machines",
  "animals",
  "comments",
  "warehouses",
] as const;
/** Tabla del pull. */
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
  "plot_seasons",
  "animals",
  "comments",
];

/** Cursor de paginación del pull: (version, id) de la última fila recibida. */
export const cursor = z.object({ version: z.number().int().nonnegative(), id: z.string() });
/** Cursor de paginación del pull. */
export type Cursor = z.infer<typeof cursor>;

/** Cuerpo del pull: tabla y cursor desde el que seguir (null = desde el principio). */
export const pullRequest = z.object({
  table: z.enum(PULL_TABLES),
  cursor: cursor.nullable(),
});
/** Cuerpo del pull. */
export type PullRequest = z.infer<typeof pullRequest>;

/** Una página del pull de una tabla. */
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
export type { PoiKind } from "./schema";
