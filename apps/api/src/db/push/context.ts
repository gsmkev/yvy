/** Contexto de un push: lo leído antes de decidir, lo que cada manejador acumula y los helpers de resultado. */
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { isAudioMime, type Mutation, type MutationResult, type RejectReason } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { areaHa, validateShape, type Area } from "@yvy/geo";
import type { DB, Stmt } from "../client";
import type { EffectRecord } from "../erp-effects";
import { validMentions } from "../comments";
import { can, type ScopedDb } from "../scoped";
import { collectIds, type PushIds } from "./ids";

export interface RecordState {
  organizationId: string;
  farmId: string;
  authorId: string;
  createdAt: number;
  deletedAt: number | null;
  lon: number | null;
  lat: number | null;
}

type TaskRow = typeof s.tasks.$inferSelect;
type PlotState = { id: string; organizationId: string; farmId: string; deletedAt: number | null };
type CommentState = { id: string; organizationId: string; authorId: string; recordId: string; deletedAt: number | null };
type AttachmentState = { id: string; organizationId: string; recordId: string; deletedAt: number | null };

/** Lo que los manejadores van dejando para armar el batch de escrituras. */
export interface PushOut {
  recordUpserts: (typeof s.records.$inferInsert)[];
  recordDeletes: string[];
  /** Registros que descuentan stock y cargan costo (ERP, E-13). */
  effectUpserts: EffectRecord[];
  attachmentUpserts: (typeof s.attachments.$inferInsert)[];
  attachmentDeletes: string[];
  taskUpdates: Stmt[];
  poiUpserts: (typeof s.pointsOfInterest.$inferInsert)[];
  plotUpserts: (typeof s.plots.$inferInsert)[];
  commentUpserts: (typeof s.comments.$inferInsert)[];
  commentDeletes: string[];
  mentionRows: { commentId: string; userId: string }[];
  applied: (typeof s.syncMutations.$inferInsert)[];
}

export interface PushCtx {
  sdb: ScopedDb;
  db: DB;
  org: string;
  userId: string;
  role: ScopedDb["auth"]["role"];
  deviceId: string;
  now: number;
  /** I-02: recibe los registros que este push crea (no los que edita), para avisar a los webhooks. */
  created?: (typeof s.records.$inferInsert)[];
  results: MutationResult[];
  out: PushOut;
  seen: Set<string>;
  records: Map<string, RecordState>;
  attachments: Map<string, AttachmentState>;
  tasks: Map<string, TaskRow & { tz: string }>;
  farms: Set<string>;
  plots: Map<string, string>;
  pois: Map<string, string>;
  /** Un id que existe en otra organización no se toca ni se ve: solo sirve para rechazar. */
  foreignPois: Set<string>;
  deletedPois: Set<string>;
  assignedPlots: Set<string>;
  workerFarms: Set<string>;
  attachCount: Map<string, number>;
  plotState: Map<string, PlotState>;
  /** Lotes de plots.upsert que ya existían antes del push (para contar los nuevos). */
  knownPlotIds: Set<string>;
  parsedPlots: Map<string, { area: Area; ha: number }>;
  planBlocked: boolean;
  commentsById: Map<string, CommentState>;
  visibleForComments: Set<string>;
  validMentioned: Set<string>;
  authorName: string;
  taskAuthorName?: string;
  /** Sin lista no hay límite; con lista (o supervisor) solo las estancias de nivel `edit`. */
  farmWritable: (farmId: string) => boolean;
  reject: (m: Mutation, reason: RejectReason, detail?: string) => void;
  accept: (m: Mutation, rowId: string) => void;
}

/** Fotos y notas de voz se cuentan aparte: una nota de voz no le quita lugar a las fotos (F-09). */
export const countKey = (recordId: string, mime: string) => `${recordId}:${isAudioMime(mime) ? "audio" : "photo"}`;

const ids = <T>(set: Set<T>) => [...set];
const empty = Promise.resolve([]);

function readTable(sdb: ScopedDb, i: PushIds, mutations: Mutation[]) {
  const { db, auth } = sdb;
  const org = auth.orgId;
  return Promise.all([
    db
      .select({ id: s.syncMutations.mutationId })
      .from(s.syncMutations)
      .where(
        inArray(
          s.syncMutations.mutationId,
          mutations.map((m) => m.mutationId),
        ),
      ),
    recordsQuery(db, i),
    i.attachmentIds.size
      ? db
          .select({
            id: s.attachments.id,
            organizationId: s.attachments.organizationId,
            recordId: s.attachments.recordId,
            deletedAt: s.attachments.deletedAt,
          })
          .from(s.attachments)
          .where(inArray(s.attachments.id, ids(i.attachmentIds)))
      : empty,
    i.taskIds.size
      ? db
          .select({ task: s.tasks, tz: s.farms.timezone })
          .from(s.tasks)
          .innerJoin(s.farms, eq(s.farms.id, s.tasks.farmId))
          .where(inArray(s.tasks.id, ids(i.taskIds)))
      : empty,
    i.farmIds.size
      ? db
          .select({ id: s.farms.id })
          .from(s.farms)
          .where(and(eq(s.farms.organizationId, org), isNull(s.farms.deletedAt), inArray(s.farms.id, ids(i.farmIds))))
      : empty,
    i.plotIds.size
      ? db
          .select({ id: s.plots.id, farmId: s.plots.farmId })
          .from(s.plots)
          .where(and(eq(s.plots.organizationId, org), isNull(s.plots.deletedAt), inArray(s.plots.id, ids(i.plotIds))))
      : empty,
    i.poiIds.size
      ? db
          .select({
            id: s.pointsOfInterest.id,
            organizationId: s.pointsOfInterest.organizationId,
            farmId: s.pointsOfInterest.farmId,
            deletedAt: s.pointsOfInterest.deletedAt,
          })
          .from(s.pointsOfInterest)
          .where(inArray(s.pointsOfInterest.id, ids(i.poiIds)))
      : empty,
    sdb.isWorker
      ? db
          .select({ plotId: s.plots.id, farmId: s.plots.farmId })
          .from(s.plots)
          .where(sql`${s.plots.id} IN ${sdb.assignedPlotsSql()}`)
      : empty,
    i.attachRecordIds.size
      ? db
          .select({ recordId: s.attachments.recordId, mime: s.attachments.mime, n: count() })
          .from(s.attachments)
          .where(and(inArray(s.attachments.recordId, ids(i.attachRecordIds)), isNull(s.attachments.deletedAt)))
          .groupBy(s.attachments.recordId, s.attachments.mime)
      : empty,
    i.plotUpsertIds.size
      ? db
          .select({
            id: s.plots.id,
            organizationId: s.plots.organizationId,
            farmId: s.plots.farmId,
            deletedAt: s.plots.deletedAt,
          })
          .from(s.plots)
          .where(inArray(s.plots.id, ids(i.plotUpsertIds)))
      : empty,
    // T-09 / K-05: estancias permitidas (supervisor, o admin/agrónomo con lista del dueño)
    auth.role === "owner" || sdb.isWorker
      ? empty
      : db
          .select({ farmId: s.farmAccess.farmId, level: s.farmAccess.level })
          .from(s.farmAccess)
          .where(and(eq(s.farmAccess.organizationId, org), eq(s.farmAccess.userId, auth.userId))),
  ]);
}

const recordsQuery = (db: DB, i: PushIds) =>
  i.recordIds.size
    ? db
        .select({
          id: s.records.id,
          organizationId: s.records.organizationId,
          farmId: s.records.farmId,
          authorId: s.records.authorId,
          createdAt: s.records.createdAt,
          deletedAt: s.records.deletedAt,
          lon: s.records.lon,
          lat: s.records.lat,
        })
        .from(s.records)
        .where(inArray(s.records.id, ids(i.recordIds)))
    : empty;

/** T-08: comentarios, los registros visibles para comentar, el nombre del autor y las menciones válidas. */
async function readComments(sdb: ScopedDb, i: PushIds) {
  const { db, auth } = sdb;
  const org = auth.orgId;
  const commentRows = i.commentIds.size
    ? await db
        .select({
          id: s.comments.id,
          organizationId: s.comments.organizationId,
          authorId: s.comments.authorId,
          recordId: s.comments.recordId,
          deletedAt: s.comments.deletedAt,
        })
        .from(s.comments)
        .where(inArray(s.comments.id, ids(i.commentIds)))
    : [];
  // registros que esta persona puede ver (los comentarios van sobre registros visibles)
  const visibleForComments = new Set(
    i.commentRecordIds.size
      ? (
          await db
            .select({ id: s.records.id })
            .from(s.records)
            .where(
              and(
                eq(s.records.organizationId, org),
                isNull(s.records.deletedAt),
                inArray(s.records.id, ids(i.commentRecordIds)),
                sdb.workerFilter("records"),
              ),
            )
        ).map((r) => r.id)
      : [],
  );
  const authorName = i.commentRecordIds.size
    ? ((await db.select({ n: s.users.fullName }).from(s.users).where(eq(s.users.id, auth.userId)).limit(1))[0]?.n ?? "")
    : "";
  const validMentioned = new Set(await validMentions(db, org, auth.userId, ids(i.mentionIds)));
  return { commentRows, visibleForComments, authorName, validMentioned };
}

/** M-03: lotes que llegan por plots.upsert (geometría ya parseada) y si el plan alcanza para los nuevos. */
async function parsePlotUpserts(sdb: ScopedDb, mutations: Mutation[], plotState: Map<string, PlotState>) {
  const parsedPlots = new Map<string, { area: Area; ha: number }>();
  let planBlocked = false;
  let newHa = 0;
  for (const m of mutations) {
    if (m.kind !== "plots.upsert" || validateShape(m.row.geometry) !== null) continue;
    const g = m.row.geometry as Area;
    const ha = areaHa(g);
    parsedPlots.set(m.row.id, { area: g, ha });
    if (!plotState.has(m.row.id)) newHa += ha;
  }
  if (newHa > 0) {
    try {
      await sdb.requireHaRoom(newHa, "plots");
    } catch {
      planBlocked = true;
    }
  }
  return { parsedPlots, planBlocked };
}

export async function buildContext(
  sdb: ScopedDb,
  deviceId: string,
  mutations: Mutation[],
  now: number,
  created?: (typeof s.records.$inferInsert)[],
): Promise<PushCtx> {
  const { db, auth } = sdb;
  const org = auth.orgId;
  const i = collectIds(mutations);

  const [seenRows, recRows, attRows, taskRows, farmRows, plotRows, poiRows, assignedRows, countRows, plotUpRows, accessRows] =
    await readTable(sdb, i, mutations);
  const { commentRows, visibleForComments, authorName, validMentioned } = await readComments(sdb, i);

  const seen = new Set(seenRows.map((r) => r.id));
  const ownPoiRows = poiRows.filter((r) => r.organizationId === org);
  const attachCount = new Map<string, number>();
  for (const r of countRows) attachCount.set(countKey(r.recordId, r.mime), (attachCount.get(countKey(r.recordId, r.mime)) ?? 0) + r.n);
  const plotState = new Map<string, PlotState>(plotUpRows.map((r) => [r.id, r]));
  const plan =
    i.plotUpsertIds.size && can.editField(auth.role)
      ? await parsePlotUpserts(sdb, mutations, plotState)
      : { parsedPlots: new Map<string, { area: Area; ha: number }>(), planBlocked: false };
  const farmLimited = auth.role === "supervisor" || accessRows.length > 0;
  const writableFarms = new Set(accessRows.filter((r) => r.level === "edit").map((r) => r.farmId));

  const results: MutationResult[] = [];
  const out: PushOut = {
    recordUpserts: [],
    recordDeletes: [],
    effectUpserts: [],
    attachmentUpserts: [],
    attachmentDeletes: [],
    taskUpdates: [],
    poiUpserts: [],
    plotUpserts: [],
    commentUpserts: [],
    commentDeletes: [],
    mentionRows: [],
    applied: [],
  };
  return {
    sdb,
    db,
    org,
    userId: auth.userId,
    role: auth.role,
    deviceId,
    now,
    created,
    results,
    out,
    seen,
    records: new Map<string, RecordState>(recRows.map((r) => [r.id, r])),
    attachments: new Map(attRows.map((r) => [r.id, r])),
    tasks: new Map(taskRows.map((r) => [r.task.id, { ...r.task, tz: r.tz }])),
    farms: new Set(farmRows.map((r) => r.id)),
    plots: new Map(plotRows.map((r) => [r.id, r.farmId])),
    pois: new Map(ownPoiRows.map((r) => [r.id, r.farmId])),
    foreignPois: new Set(poiRows.filter((r) => r.organizationId !== org).map((r) => r.id)),
    deletedPois: new Set(ownPoiRows.filter((r) => r.deletedAt).map((r) => r.id)),
    assignedPlots: new Set(assignedRows.map((r) => r.plotId)),
    workerFarms: new Set(assignedRows.map((r) => r.farmId)),
    attachCount,
    plotState,
    knownPlotIds: new Set(plotUpRows.map((r) => r.id)),
    ...plan,
    commentsById: new Map(commentRows.map((r) => [r.id, r])),
    visibleForComments,
    validMentioned,
    authorName,
    farmWritable: (farmId) => !farmLimited || writableFarms.has(farmId),
    reject: (m, reason, detail) =>
      results.push({ mutationId: m.mutationId, status: "rejected", reason, ...(detail ? { detail } : {}) }),
    accept: (m, rowId) => {
      seen.add(m.mutationId);
      const [tableName, op] = m.kind.split(".") as [string, string];
      out.applied.push({ mutationId: m.mutationId, userId: auth.userId, deviceId, tableName, rowId, op, receivedAt: now });
      results.push({ mutationId: m.mutationId, status: "applied" });
    },
  };
}
