/**
 * Aplicación de un push (PRD §11). Todo en un solo db.batch() = una transacción.
 * Presupuesto: ≤ 40 mutaciones → ~9 lecturas + ~15 escrituras, bajo el límite de 50 queries de D1.
 */
import { and, count, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  isAudioMime,
  closeProblem,
  closeRequirements,
  livestockPlotProblem,
  localDate,
  nextDueDate,
  nextOccurrenceId,
  parseChecklist,
  parseRecordData,
  resetChecklist,
  serializeChecklist,
  setChecklistItem,
  RECORD_SCHEMA_VERSION,
  LIMITS,
  type Mutation,
  type MutationResult,
  type PushResponse,
  type RejectReason,
} from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { areaHa, bboxOf, validateShape, type Area } from "@yvy/geo";
import { bumpVersion, chunkForParams, currentVersion, runBatch, type Stmt } from "./client";
import { hasEffects, recordEffects, type EffectRecord } from "./erp-effects";
import { auditStmts } from "./audit";
import { mentionStmts, validMentions } from "./comments";
import { funnelEvent } from "./events";
import { can, type ScopedDb } from "./scoped";

const paramsPerRow = (t: SQLiteTable) => Object.keys(getTableColumns(t)).length;

/** Rutas en R2. La nota de voz (F-09) es un solo archivo .m4a: no tiene miniatura (thumbPath vacío). */
export const attachmentPaths = (orgId: string, recordId: string, attachmentId: string, mime: string = "image/webp") =>
  isAudioMime(mime)
    ? { storagePath: `organizations/${orgId}/records/${recordId}/${attachmentId}.m4a`, thumbPath: "" }
    : {
        storagePath: `organizations/${orgId}/records/${recordId}/${attachmentId}.webp`,
        thumbPath: `organizations/${orgId}/records/${recordId}/${attachmentId}_t.webp`,
      };

interface RecordState {
  organizationId: string;
  farmId: string;
  authorId: string;
  createdAt: number;
  deletedAt: number | null;
  lon: number | null;
  lat: number | null;
}

export async function applyPush(
  sdb: ScopedDb,
  deviceId: string,
  mutations: Mutation[],
  now = Date.now(),
): Promise<PushResponse> {
  const { db, auth } = sdb;
  const org = auth.orgId;

  // ---------- Lecturas (todas por IN, con índices) ----------
  const recordIds = new Set<string>();
  const attachmentIds = new Set<string>();
  const taskIds = new Set<string>();
  const farmIds = new Set<string>();
  const plotIds = new Set<string>();
  const poiIds = new Set<string>();
  const plotUpsertIds = new Set<string>();
  const attachRecordIds = new Set<string>();
  // T-08: comentarios
  const commentIds = new Set<string>();
  const commentRecordIds = new Set<string>();
  const mentionIds = new Set<string>();
  for (const m of mutations) {
    switch (m.kind) {
      case "comments.upsert":
        commentIds.add(m.row.id);
        commentRecordIds.add(m.row.recordId);
        m.row.mentions.forEach((u) => mentionIds.add(u));
        break;
      case "comments.delete":
        commentIds.add(m.row.id);
        break;
      case "records.upsert":
        recordIds.add(m.row.id);
        farmIds.add(m.row.farmId);
        if (m.row.plotId) plotIds.add(m.row.plotId);
        if (m.row.poiId) poiIds.add(m.row.poiId);
        if (m.row.kind === "herd_move") {
          const to = (m.row.data as { toPlotId?: unknown } | null)?.toPlotId;
          if (typeof to === "string") plotIds.add(to);
        }
        break;
      case "records.delete":
        recordIds.add(m.row.id);
        break;
      case "attachments.upsert":
        attachmentIds.add(m.row.id);
        recordIds.add(m.row.recordId);
        attachRecordIds.add(m.row.recordId);
        break;
      case "attachments.delete":
        attachmentIds.add(m.row.id);
        break;
      case "tasks.status":
      case "tasks.check":
        taskIds.add(m.row.id);
        // T-03: el registro con el que se cierra una tarea (y sus fotos) hay que mirarlo para exigir foto y ubicación
        if (m.kind === "tasks.status" && m.row.status === "done" && m.row.recordId) {
          recordIds.add(m.row.recordId);
          attachRecordIds.add(m.row.recordId);
        }
        break;
      case "pois.upsert":
        poiIds.add(m.row.id);
        farmIds.add(m.row.farmId);
        break;
      case "plots.upsert":
        plotUpsertIds.add(m.row.id);
        farmIds.add(m.row.farmId);
        break;
    }
  }
  const ids = <T>(set: Set<T>) => [...set];
  const empty = Promise.resolve([] as never[]);

  const [seenRows, recRows, attRows, taskRows, farmRows, plotRows, poiRows, assignedRows, countRows, plotUpRows, accessRows] =
    await Promise.all([
      db
        .select({ id: s.syncMutations.mutationId })
        .from(s.syncMutations)
        .where(
          inArray(
            s.syncMutations.mutationId,
            mutations.map((m) => m.mutationId),
          ),
        ),
      recordIds.size
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
            .where(inArray(s.records.id, ids(recordIds)))
        : empty,
      attachmentIds.size
        ? db
            .select({
              id: s.attachments.id,
              organizationId: s.attachments.organizationId,
              recordId: s.attachments.recordId,
              deletedAt: s.attachments.deletedAt,
            })
            .from(s.attachments)
            .where(inArray(s.attachments.id, ids(attachmentIds)))
        : empty,
      taskIds.size
        ? db
            .select({ task: s.tasks, tz: s.farms.timezone })
            .from(s.tasks)
            .innerJoin(s.farms, eq(s.farms.id, s.tasks.farmId))
            .where(inArray(s.tasks.id, ids(taskIds)))
        : empty,
      farmIds.size
        ? db
            .select({ id: s.farms.id })
            .from(s.farms)
            .where(and(eq(s.farms.organizationId, org), isNull(s.farms.deletedAt), inArray(s.farms.id, ids(farmIds))))
        : empty,
      plotIds.size
        ? db
            .select({ id: s.plots.id, farmId: s.plots.farmId })
            .from(s.plots)
            .where(and(eq(s.plots.organizationId, org), isNull(s.plots.deletedAt), inArray(s.plots.id, ids(plotIds))))
        : empty,
      poiIds.size
        ? db
            .select({
              id: s.pointsOfInterest.id,
              organizationId: s.pointsOfInterest.organizationId,
              farmId: s.pointsOfInterest.farmId,
              deletedAt: s.pointsOfInterest.deletedAt,
            })
            .from(s.pointsOfInterest)
            .where(inArray(s.pointsOfInterest.id, ids(poiIds)))
        : empty,
      sdb.isWorker
        ? db
            .select({ plotId: s.plots.id, farmId: s.plots.farmId })
            .from(s.plots)
            .where(sql`${s.plots.id} IN ${sdb.assignedPlotsSql()}`)
        : empty,
      attachRecordIds.size
        ? db
            .select({ recordId: s.attachments.recordId, mime: s.attachments.mime, n: count() })
            .from(s.attachments)
            .where(and(inArray(s.attachments.recordId, ids(attachRecordIds)), isNull(s.attachments.deletedAt)))
            .groupBy(s.attachments.recordId, s.attachments.mime)
        : empty,
      plotUpsertIds.size
        ? db
            .select({
              id: s.plots.id,
              organizationId: s.plots.organizationId,
              farmId: s.plots.farmId,
              deletedAt: s.plots.deletedAt,
            })
            .from(s.plots)
            .where(inArray(s.plots.id, ids(plotUpsertIds)))
        : empty,
      // T-09 / K-05: estancias permitidas (supervisor, o admin/agrónomo con lista del dueño)
      auth.role === "owner" || sdb.isWorker
        ? empty
        : db
            .select({ farmId: s.farmAccess.farmId, level: s.farmAccess.level })
            .from(s.farmAccess)
            .where(and(eq(s.farmAccess.organizationId, org), eq(s.farmAccess.userId, auth.userId))),
    ]);

  const commentRows = commentIds.size
    ? await db
        .select({
          id: s.comments.id,
          organizationId: s.comments.organizationId,
          authorId: s.comments.authorId,
          recordId: s.comments.recordId,
          deletedAt: s.comments.deletedAt,
        })
        .from(s.comments)
        .where(inArray(s.comments.id, ids(commentIds)))
    : [];
  // registros que esta persona puede ver (los comentarios van sobre registros visibles)
  const visibleForComments = new Set(
    commentRecordIds.size
      ? (
          await db
            .select({ id: s.records.id })
            .from(s.records)
            .where(
              and(
                eq(s.records.organizationId, org),
                isNull(s.records.deletedAt),
                inArray(s.records.id, ids(commentRecordIds)),
                sdb.workerFilter("records"),
              ),
            )
        ).map((r) => r.id)
      : [],
  );
  const authorName = commentRecordIds.size
    ? ((await db.select({ n: s.users.fullName }).from(s.users).where(eq(s.users.id, auth.userId)).limit(1))[0]?.n ?? "")
    : "";
  const validMentioned = new Set(await validMentions(db, org, auth.userId, ids(mentionIds)));
  const commentsById = new Map(commentRows.map((r) => [r.id, r]));
  const commentUpserts: (typeof s.comments.$inferInsert)[] = [];
  const commentDeletes: string[] = [];
  const mentionRows: { commentId: string; userId: string }[] = [];

  const seen = new Set(seenRows.map((r) => r.id));
  const records = new Map<string, RecordState>(recRows.map((r) => [r.id, r]));
  const attachments = new Map(attRows.map((r) => [r.id, r]));
  const tasks = new Map(taskRows.map((r) => [r.task.id, { ...r.task, tz: r.tz }]));
  const farms = new Set(farmRows.map((r) => r.id));
  const plots = new Map(plotRows.map((r) => [r.id, r.farmId]));
  // Un id que existe en otra organización no se toca ni se ve: solo sirve para rechazar.
  const ownPoiRows = poiRows.filter((r) => r.organizationId === org);
  const foreignPois = new Set(poiRows.filter((r) => r.organizationId !== org).map((r) => r.id));
  const pois = new Map(ownPoiRows.map((r) => [r.id, r.farmId]));
  const deletedPois = new Set(ownPoiRows.filter((r) => r.deletedAt).map((r) => r.id));
  const assignedPlots = new Set(assignedRows.map((r) => r.plotId));
  const workerFarms = new Set(assignedRows.map((r) => r.farmId));
  // Fotos y notas de voz se cuentan aparte: una nota de voz no le quita lugar a las fotos (F-09).
  const countKey = (recordId: string, mime: string) => `${recordId}:${isAudioMime(mime) ? "audio" : "photo"}`;
  const attachCount = new Map<string, number>();
  for (const r of countRows) attachCount.set(countKey(r.recordId, r.mime), (attachCount.get(countKey(r.recordId, r.mime)) ?? 0) + r.n);
  // M-03: lotes que llegan por plots.upsert. Un id de otra organización solo sirve para rechazar.
  const plotState = new Map(plotUpRows.map((r) => [r.id, r]));
  const parsedPlots = new Map<string, { area: Area; ha: number }>();
  let planBlocked = false;
  if (plotUpsertIds.size && can.editField(auth.role)) {
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
  }
  const farmLimited = auth.role === "supervisor" || accessRows.length > 0;
  const writableFarms = new Set(accessRows.filter((r) => r.level === "edit").map((r) => r.farmId));
  /** Sin lista no hay límite; con lista (o supervisor) solo las estancias de nivel `edit`. */
  const farmWritable = (farmId: string) => !farmLimited || writableFarms.has(farmId);

  // ---------- Decisión por mutación, en orden ----------
  const results: MutationResult[] = [];
  const recordUpserts: (typeof s.records.$inferInsert)[] = [];
  const recordDeletes: string[] = [];
  /** Registros que descuentan stock y cargan costo (ERP, E-13). */
  const effectUpserts: EffectRecord[] = [];
  const attachmentUpserts: (typeof s.attachments.$inferInsert)[] = [];
  const attachmentDeletes: string[] = [];
  const taskUpdates: Stmt[] = [];
  const poiUpserts: (typeof s.pointsOfInterest.$inferInsert)[] = [];
  const plotUpserts: (typeof s.plots.$inferInsert)[] = [];
  const applied: (typeof s.syncMutations.$inferInsert)[] = [];

  const reject = (m: Mutation, reason: RejectReason, detail?: string) =>
    results.push({ mutationId: m.mutationId, status: "rejected", reason, ...(detail ? { detail } : {}) });
  const accept = (m: Mutation, rowId: string) => {
    seen.add(m.mutationId);
    const [tableName, op] = m.kind.split(".") as [string, string];
    applied.push({ mutationId: m.mutationId, userId: auth.userId, deviceId, tableName, rowId, op, receivedAt: now });
    results.push({ mutationId: m.mutationId, status: "applied" });
  };

  for (const m of mutations) {
    if (seen.has(m.mutationId)) {
      results.push({ mutationId: m.mutationId, status: "duplicate" });
      continue;
    }
    switch (m.kind) {
      case "records.upsert": {
        const r = m.row;
        if (r.capturedAt > now + LIMITS.sync.maxFutureCaptureMs) {
          reject(m, "captured_in_future");
          break;
        }
        const existing = records.get(r.id);
        if (existing && existing.organizationId !== org) {
          reject(m, "not_found");
          break;
        }
        if (existing?.deletedAt) {
          reject(m, "deleted");
          break;
        }
        if (existing) {
          const err = sdb.canEditRecord(existing);
          if (err) {
            reject(m, err);
            break;
          }
        }
        if (!farms.has(r.farmId) || (sdb.isWorker && !workerFarms.has(r.farmId)) || !farmWritable(r.farmId)) {
          reject(m, "forbidden", "farm");
          break;
        }
        if (r.plotId && (plots.get(r.plotId) !== r.farmId || (sdb.isWorker && !assignedPlots.has(r.plotId)))) {
          reject(m, "forbidden", "plot");
          break;
        }
        if (r.poiId && pois.get(r.poiId) !== r.farmId) {
          reject(m, "invalid", "poi");
          break;
        }
        if ((r.lon === null) !== (r.lat === null) || r.schemaVersion > RECORD_SCHEMA_VERSION) {
          reject(m, "invalid");
          break;
        }
        const data = parseRecordData(r.kind, r.data);
        if (!data.success) {
          reject(m, "invalid", data.error.issues[0]?.message);
          break;
        }
        // Ganadería: el potrero es el del registro; el destino de un movimiento tiene que ser de la misma estancia.
        const livestock = livestockPlotProblem(r.kind, r.plotId, data.data);
        if (livestock) {
          reject(m, "invalid", livestock);
          break;
        }
        const toPlotId = r.kind === "herd_move" ? (data.data as { toPlotId?: string }).toPlotId : undefined;
        if (toPlotId && (plots.get(toPlotId) !== r.farmId || (sdb.isWorker && !assignedPlots.has(toPlotId)))) {
          reject(m, "forbidden", "plot");
          break;
        }
        const authorId = existing?.authorId ?? auth.userId;
        const createdAt = existing?.createdAt ?? now;
        recordUpserts.push({
          id: r.id,
          organizationId: org,
          farmId: r.farmId,
          plotId: r.plotId,
          poiId: r.poiId,
          authorId,
          kind: r.kind,
          data: JSON.stringify(data.data),
          schemaVersion: r.schemaVersion,
          lon: r.lon,
          lat: r.lat,
          gpsAccuracyM: r.gpsAccuracyM,
          capturedAt: r.capturedAt,
          deviceId,
          createdAt,
          updatedAt: now,
        });
        records.set(r.id, { organizationId: org, farmId: r.farmId, authorId, createdAt, deletedAt: null, lon: r.lon, lat: r.lat });
        if (hasEffects(r.kind))
          effectUpserts.push({
            id: r.id,
            farmId: r.farmId,
            plotId: r.plotId,
            kind: r.kind,
            data: data.data as Record<string, unknown>,
            capturedAt: r.capturedAt,
          });
        accept(m, r.id);
        break;
      }
      case "records.delete": {
        const existing = records.get(m.row.id);
        if (!existing || existing.organizationId !== org) {
          reject(m, "not_found");
          break;
        }
        if (!existing.deletedAt) {
          const err = !farmWritable(existing.farmId) ? "forbidden" : sdb.canEditRecord(existing);
          if (err) {
            reject(m, err);
            break;
          }
          recordDeletes.push(m.row.id);
          existing.deletedAt = now;
        }
        accept(m, m.row.id);
        break;
      }
      case "attachments.upsert": {
        const a = m.row;
        const rec = records.get(a.recordId);
        if (!rec || rec.organizationId !== org) {
          reject(m, "not_found", "record");
          break;
        }
        if (rec.deletedAt) {
          reject(m, "deleted");
          break;
        }
        const err = !farmWritable(rec.farmId) ? "forbidden" : sdb.canEditRecord(rec);
        if (err) {
          reject(m, err);
          break;
        }
        const existing = attachments.get(a.id);
        if (existing && (existing.organizationId !== org || existing.recordId !== a.recordId)) {
          reject(m, "not_found");
          break;
        }
        if (!existing) {
          const key = countKey(a.recordId, a.mime);
          const n = attachCount.get(key) ?? 0;
          if (n >= (isAudioMime(a.mime) ? LIMITS.audio.maxPerRecord : LIMITS.photos.maxPerRecord)) {
            reject(m, "too_many_attachments");
            break;
          }
          attachCount.set(key, n + 1);
          attachments.set(a.id, { id: a.id, organizationId: org, recordId: a.recordId, deletedAt: null });
        }
        attachmentUpserts.push({
          id: a.id,
          organizationId: org,
          recordId: a.recordId,
          ...attachmentPaths(org, a.recordId, a.id, a.mime),
          mime: a.mime,
          width: a.width,
          height: a.height,
          bytes: a.bytes,
          createdAt: now,
          updatedAt: now,
        });
        accept(m, a.id);
        break;
      }
      case "attachments.delete": {
        const existing = attachments.get(m.row.id);
        const rec = existing && records.get(existing.recordId);
        if (!existing || existing.organizationId !== org) {
          reject(m, "not_found");
          break;
        }
        if (!existing.deletedAt) {
          // Si el registro no vino en las lecturas, alcanza con que el adjunto sea de la organización
          // y el usuario pueda editar; lo resolvemos con una lectura puntual.
          const owner =
            rec ??
            (
              await db
                .select({
                  organizationId: s.records.organizationId,
                  farmId: s.records.farmId,
                  authorId: s.records.authorId,
                  createdAt: s.records.createdAt,
                  deletedAt: s.records.deletedAt,
                  lon: s.records.lon,
                  lat: s.records.lat,
                })
                .from(s.records)
                .where(eq(s.records.id, existing.recordId))
                .limit(1)
            )[0];
          const err = !owner ? "not_found" : !farmWritable(owner.farmId) ? "forbidden" : sdb.canEditRecord(owner);
          if (err) {
            reject(m, err);
            break;
          }
          attachmentDeletes.push(m.row.id);
          existing.deletedAt = now;
        }
        accept(m, m.row.id);
        break;
      }
      case "pois.upsert": {
        const p = m.row;
        if (!can.editPoi(auth.role)) {
          reject(m, "forbidden", "poi");
          break;
        }
        if (foreignPois.has(p.id)) {
          reject(m, "not_found");
          break;
        }
        const knownFarm = pois.get(p.id);
        if (knownFarm !== undefined && knownFarm !== p.farmId) {
          // Existe (de esta organización) pero en otra estancia: no se mueve de estancia.
          reject(m, "invalid", "farm");
          break;
        }
        if (deletedPois.has(p.id)) {
          reject(m, "deleted");
          break;
        }
        if (!farms.has(p.farmId) || !farmWritable(p.farmId)) {
          reject(m, "forbidden", "farm");
          break;
        }
        poiUpserts.push({ id: p.id, organizationId: org, farmId: p.farmId, kind: p.kind, name: p.name, lon: p.lon, lat: p.lat, createdAt: now, updatedAt: now });
        pois.set(p.id, p.farmId);
        accept(m, p.id);
        break;
      }
      case "plots.upsert": {
        const p = m.row;
        if (!can.editField(auth.role)) {
          reject(m, "forbidden", "plot");
          break;
        }
        const known = plotState.get(p.id);
        if (known && known.organizationId !== org) {
          reject(m, "not_found");
          break;
        }
        if (known?.deletedAt) {
          reject(m, "deleted");
          break;
        }
        if (known && known.farmId !== p.farmId) {
          reject(m, "invalid", "farm");
          break;
        }
        if (!farms.has(p.farmId)) {
          reject(m, "forbidden", "farm");
          break;
        }
        const geo = parsedPlots.get(p.id);
        if (!geo || geo.ha < LIMITS.geometry.minPlotHa) {
          reject(m, "invalid", geo ? "area" : "geometry");
          break;
        }
        if (!known && planBlocked) {
          reject(m, "forbidden", "plan");
          break;
        }
        plotUpserts.push({
          id: p.id,
          organizationId: org,
          farmId: p.farmId,
          name: p.name,
          kind: p.kind,
          crop: p.kind === "crop" ? p.crop : null,
          geometry: JSON.stringify(geo.area),
          ...bboxOf(geo.area),
          areaHa: geo.ha,
          createdAt: now,
          updatedAt: now,
        });
        plots.set(p.id, p.farmId);
        // Si se repite el mismo lote en el push, el último gana y no se vuelve a contar como nuevo
        plotState.set(p.id, { id: p.id, organizationId: org, farmId: p.farmId, deletedAt: null });
        accept(m, p.id);
        break;
      }
      case "comments.upsert": {
        const c = m.row;
        const prev = commentsById.get(c.id);
        if (prev && (prev.organizationId !== org || prev.authorId !== auth.userId || prev.recordId !== c.recordId)) {
          reject(m, prev.organizationId !== org ? "not_found" : "forbidden");
          break;
        }
        if (prev?.deletedAt) {
          reject(m, "deleted");
          break;
        }
        if (!visibleForComments.has(c.recordId)) {
          reject(m, "not_found", "record");
          break;
        }
        const mentions = c.mentions.filter((u) => validMentioned.has(u));
        if (!prev) mentions.forEach((u) => mentionRows.push({ commentId: c.id, userId: u }));
        commentUpserts.push({
          id: c.id,
          organizationId: org,
          recordId: c.recordId,
          authorId: auth.userId,
          authorName,
          body: c.body,
          mentions: JSON.stringify(mentions),
          createdAt: now,
          updatedAt: now,
        });
        commentsById.set(c.id, { id: c.id, organizationId: org, authorId: auth.userId, recordId: c.recordId, deletedAt: null });
        accept(m, c.id);
        break;
      }
      case "comments.delete": {
        const prev = commentsById.get(m.row.id);
        if (!prev || prev.organizationId !== org) {
          reject(m, "not_found");
          break;
        }
        if (prev.authorId !== auth.userId && !can.manageWorkers(auth.role)) {
          reject(m, "forbidden");
          break;
        }
        if (!prev.deletedAt) {
          commentDeletes.push(prev.id);
          prev.deletedAt = now;
        }
        accept(m, prev.id);
        break;
      }
      case "tasks.status": {
        const t = tasks.get(m.row.id);
        if (!t || t.organizationId !== org) {
          reject(m, "not_found");
          break;
        }
        if ((sdb.isWorker && t.assigneeId !== auth.userId) || !farmWritable(t.farmId)) {
          reject(m, "forbidden");
          break;
        }
        // T-03: ciertas tareas se cierran solo con un registro que traiga foto y/o ubicación
        const need = m.row.status === "done" && t.status !== "done" ? closeRequirements(t.kind) : null;
        if (need) {
          const rec = m.row.recordId ? records.get(m.row.recordId) : undefined;
          const problem = closeProblem(
            need,
            rec && !rec.deletedAt && rec.organizationId === org ? rec : null,
            m.row.recordId ? (attachCount.get(`${m.row.recordId}:photo`) ?? 0) : 0,
          );
          if (problem) {
            reject(m, "close_requirements", problem);
            break;
          }
        }
        // PRD §11: `done` gana sobre `open`.
        if (!(t.status === "done" && m.row.status === "open")) {
          const done = m.row.status === "done";
          taskUpdates.push(
            db
              .update(s.tasks)
              .set({
                status: m.row.status,
                completedAt: done ? (m.row.completedAt ?? now) : null,
                completedBy: done ? auth.userId : null,
                recordId: m.row.recordId,
                updatedAt: now,
                version: currentVersion,
              })
              .where(and(eq(s.tasks.id, t.id), eq(s.tasks.organizationId, org))),
          );
          // Fase 3: al completar una tarea recurrente nace la siguiente, con el mismo id que crea el celular.
          const next = done ? nextDueDate(t.dueDate, t.recurrence, localDate(m.row.completedAt ?? now, t.tz)) : null;
          if (next && t.status !== "done") {
            taskUpdates.push(
              db
                .insert(s.tasks)
                .values({
                  id: nextOccurrenceId(t.id),
                  organizationId: org,
                  farmId: t.farmId,
                  plotId: t.plotId,
                  assigneeId: t.assigneeId,
                  title: t.title,
                  kind: t.kind,
                  lon: t.lon,
                  lat: t.lat,
                  prescription: t.prescription,
                  workOrder: t.workOrder,
                  dueDate: next,
                  dueTime: t.dueTime,
                  priority: t.priority,
                  recurrence: t.recurrence,
                  status: "open",
                  checklist: serializeChecklist(resetChecklist(parseChecklist(t.checklist))),
                  createdBy: t.createdBy,
                  createdAt: now,
                  updatedAt: now,
                  version: currentVersion,
                })
                .onConflictDoNothing(),
            );
          }
          t.status = m.row.status;
        }
        accept(m, t.id);
        break;
      }
      case "tasks.check": {
        const t = tasks.get(m.row.id);
        if (!t || t.organizationId !== org) {
          reject(m, "not_found");
          break;
        }
        if ((sdb.isWorker && t.assigneeId !== auth.userId) || !farmWritable(t.farmId)) {
          reject(m, "forbidden");
          break;
        }
        // Cada tilde es un ítem: el último gana por ítem, y lo demás de la lista no se toca.
        const next = setChecklistItem(parseChecklist(t.checklist), m.row.itemId, m.row.done);
        if (!next) {
          reject(m, "invalid", "item");
          break;
        }
        t.checklist = serializeChecklist(next);
        taskUpdates.push(
          db
            .update(s.tasks)
            .set({ checklist: t.checklist, updatedAt: now, version: currentVersion })
            .where(and(eq(s.tasks.id, t.id), eq(s.tasks.organizationId, org))),
        );
        accept(m, t.id);
        break;
      }
    }
  }

  // ---------- Escrituras: una transacción ----------
  const stmts: Stmt[] = [];
  const touchesSynced =
    recordUpserts.length +
      recordDeletes.length +
      attachmentUpserts.length +
      attachmentDeletes.length +
      poiUpserts.length +
      plotUpserts.length +
      commentUpserts.length +
      commentDeletes.length +
      taskUpdates.length >
    0;
  if (touchesSynced) stmts.push(bumpVersion(db));
  // P-03: primer registro de la organización (una sentencia; no hace nada si ya existe)
  if (recordUpserts.length) stmts.push(funnelEvent(db, "first_record", auth.userId, org, now));

  // Una sentencia por lote: las geometrías son largas y no conviene agruparlas (igual que createPlots).
  const newPlots = plotUpserts.filter((p) => !plotUpRows.some((r) => r.id === p.id));
  for (const p of plotUpserts) {
    stmts.push(
      db
        .insert(s.plots)
        .values({ ...p, version: currentVersion })
        .onConflictDoUpdate({
          target: s.plots.id,
          set: {
            name: sql`excluded.name`,
            kind: sql`excluded.kind`,
            crop: sql`excluded.crop`,
            geometry: sql`excluded.geometry`,
            minLon: sql`excluded.min_lon`,
            minLat: sql`excluded.min_lat`,
            maxLon: sql`excluded.max_lon`,
            maxLat: sql`excluded.max_lat`,
            areaHa: sql`excluded.area_ha`,
            updatedAt: sql`excluded.updated_at`,
            version: sql`excluded.version`,
          },
        }),
    );
  }
  if (newPlots.length) stmts.push(funnelEvent(db, "plots_created", auth.userId, org, now));
  for (const chunk of chunkForParams(poiUpserts, paramsPerRow(s.pointsOfInterest))) {
    stmts.push(
      db
        .insert(s.pointsOfInterest)
        .values(chunk.map((p) => ({ ...p, version: currentVersion })))
        .onConflictDoUpdate({
          target: s.pointsOfInterest.id,
          set: {
            kind: sql`excluded.kind`,
            name: sql`excluded.name`,
            lon: sql`excluded.lon`,
            lat: sql`excluded.lat`,
            updatedAt: sql`excluded.updated_at`,
            version: sql`excluded.version`,
          },
        }),
    );
  }
  for (const chunk of chunkForParams(recordUpserts, paramsPerRow(s.records))) {
    stmts.push(
      db
        .insert(s.records)
        .values(chunk.map((r) => ({ ...r, version: currentVersion })))
        .onConflictDoUpdate({
          target: s.records.id,
          set: {
            farmId: sql`excluded.farm_id`,
            plotId: sql`excluded.plot_id`,
            poiId: sql`excluded.poi_id`,
            kind: sql`excluded.kind`,
            data: sql`excluded.data`,
            schemaVersion: sql`excluded.schema_version`,
            lon: sql`excluded.lon`,
            lat: sql`excluded.lat`,
            gpsAccuracyM: sql`excluded.gps_accuracy_m`,
            capturedAt: sql`excluded.captured_at`,
            deviceId: sql`excluded.device_id`,
            updatedAt: sql`excluded.updated_at`,
            version: sql`excluded.version`,
          },
        }),
    );
  }
  // K-06: el borrado de un registro deja quién y cuándo (en una o pocas sentencias)
  stmts.push(
    ...auditStmts(
      db,
      { userId: auth.userId, orgId: org },
      recordDeletes.map((id) => ({ action: "record_delete", entity: "record" as const, entityId: id, detail: { deviceId } })),
      now,
    ),
  );
  for (const chunk of chunkForParams(recordDeletes, 1)) {
    stmts.push(
      db
        .update(s.records)
        .set({ deletedAt: now, updatedAt: now, version: currentVersion })
        .where(and(eq(s.records.organizationId, org), inArray(s.records.id, chunk))),
    );
  }
  // ERP (E-13): consumo de insumos y costo de los registros que llegan, y reversión de los que se borran.
  stmts.push(...(await recordEffects(sdb, effectUpserts, recordDeletes)));
  for (const chunk of chunkForParams(attachmentUpserts, paramsPerRow(s.attachments))) {
    stmts.push(
      db
        .insert(s.attachments)
        .values(chunk.map((a) => ({ ...a, version: currentVersion })))
        .onConflictDoUpdate({
          target: s.attachments.id,
          set: {
            width: sql`excluded.width`,
            height: sql`excluded.height`,
            bytes: sql`excluded.bytes`,
            updatedAt: sql`excluded.updated_at`,
            version: sql`excluded.version`,
          },
        }),
    );
  }
  for (const chunk of chunkForParams(attachmentDeletes, 1)) {
    stmts.push(
      db
        .update(s.attachments)
        .set({ deletedAt: now, updatedAt: now, version: currentVersion })
        .where(and(eq(s.attachments.organizationId, org), inArray(s.attachments.id, chunk))),
    );
  }
  for (const chunk of chunkForParams(commentUpserts, paramsPerRow(s.comments))) {
    stmts.push(
      db
        .insert(s.comments)
        .values(chunk.map((c) => ({ ...c, version: currentVersion })))
        .onConflictDoUpdate({
          target: s.comments.id,
          set: {
            body: sql`excluded.body`,
            updatedAt: sql`excluded.updated_at`,
            version: sql`excluded.version`,
          },
        }),
    );
  }
  for (const chunk of chunkForParams(commentDeletes, 1)) {
    stmts.push(
      db
        .update(s.comments)
        .set({ deletedAt: now, updatedAt: now, version: currentVersion })
        .where(and(eq(s.comments.organizationId, org), inArray(s.comments.id, chunk))),
    );
  }
  stmts.push(...(await mentionStmts(db, mentionRows, now)));
  stmts.push(...taskUpdates);
  for (const chunk of chunkForParams(applied, paramsPerRow(s.syncMutations))) {
    stmts.push(db.insert(s.syncMutations).values(chunk).onConflictDoNothing());
  }

  await runBatch(db, stmts);
  return { results };
}
