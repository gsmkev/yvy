/**
 * Aplicación de un push (PRD §11). Todo en un solo db.batch() = una transacción.
 * Presupuesto: ≤ 40 mutaciones → ~9 lecturas + ~15 escrituras, bajo el límite de 50 queries de D1.
 */
import { and, count, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import {
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
import { bumpVersion, chunkForParams, currentVersion, runBatch, type Stmt } from "./client";
import { can, type ScopedDb } from "./scoped";

const paramsPerRow = (t: SQLiteTable) => Object.keys(getTableColumns(t)).length;

export const attachmentPaths = (orgId: string, recordId: string, attachmentId: string) => ({
  storagePath: `organizations/${orgId}/records/${recordId}/${attachmentId}.webp`,
  thumbPath: `organizations/${orgId}/records/${recordId}/${attachmentId}_t.webp`,
});

interface RecordState {
  organizationId: string;
  authorId: string;
  createdAt: number;
  deletedAt: number | null;
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
  const attachRecordIds = new Set<string>();
  for (const m of mutations) {
    switch (m.kind) {
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
        break;
      case "pois.upsert":
        poiIds.add(m.row.id);
        farmIds.add(m.row.farmId);
        break;
    }
  }
  const ids = <T>(set: Set<T>) => [...set];
  const empty = Promise.resolve([] as never[]);

  const [seenRows, recRows, attRows, taskRows, farmRows, plotRows, poiRows, assignedRows, countRows] =
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
              authorId: s.records.authorId,
              createdAt: s.records.createdAt,
              deletedAt: s.records.deletedAt,
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
            .select({ recordId: s.attachments.recordId, n: count() })
            .from(s.attachments)
            .where(and(inArray(s.attachments.recordId, ids(attachRecordIds)), isNull(s.attachments.deletedAt)))
            .groupBy(s.attachments.recordId)
        : empty,
    ]);

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
  const attachCount = new Map(countRows.map((r) => [r.recordId, r.n]));

  // ---------- Decisión por mutación, en orden ----------
  const results: MutationResult[] = [];
  const recordUpserts: (typeof s.records.$inferInsert)[] = [];
  const recordDeletes: string[] = [];
  const attachmentUpserts: (typeof s.attachments.$inferInsert)[] = [];
  const attachmentDeletes: string[] = [];
  const taskUpdates: Stmt[] = [];
  const poiUpserts: (typeof s.pointsOfInterest.$inferInsert)[] = [];
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
        if (!farms.has(r.farmId) || (sdb.isWorker && !workerFarms.has(r.farmId))) {
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
        records.set(r.id, { organizationId: org, authorId, createdAt, deletedAt: null });
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
          const err = sdb.canEditRecord(existing);
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
        const err = sdb.canEditRecord(rec);
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
          const n = attachCount.get(a.recordId) ?? 0;
          if (n >= LIMITS.photos.maxPerRecord) {
            reject(m, "too_many_attachments");
            break;
          }
          attachCount.set(a.recordId, n + 1);
          attachments.set(a.id, { id: a.id, organizationId: org, recordId: a.recordId, deletedAt: null });
        }
        attachmentUpserts.push({
          id: a.id,
          organizationId: org,
          recordId: a.recordId,
          ...attachmentPaths(org, a.recordId, a.id),
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
                  authorId: s.records.authorId,
                  createdAt: s.records.createdAt,
                  deletedAt: s.records.deletedAt,
                })
                .from(s.records)
                .where(eq(s.records.id, existing.recordId))
                .limit(1)
            )[0];
          const err = owner ? sdb.canEditRecord(owner) : "not_found";
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
        if (!farms.has(p.farmId)) {
          reject(m, "forbidden", "farm");
          break;
        }
        poiUpserts.push({ id: p.id, organizationId: org, farmId: p.farmId, kind: p.kind, name: p.name, lon: p.lon, lat: p.lat, createdAt: now, updatedAt: now });
        pois.set(p.id, p.farmId);
        accept(m, p.id);
        break;
      }
      case "tasks.status": {
        const t = tasks.get(m.row.id);
        if (!t || t.organizationId !== org) {
          reject(m, "not_found");
          break;
        }
        if (sdb.isWorker && t.assigneeId !== auth.userId) {
          reject(m, "forbidden");
          break;
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
                  dueDate: next,
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
        if (sdb.isWorker && t.assigneeId !== auth.userId) {
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
      taskUpdates.length >
    0;
  if (touchesSynced) stmts.push(bumpVersion(db));

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
  for (const chunk of chunkForParams(recordDeletes, 1)) {
    stmts.push(
      db
        .update(s.records)
        .set({ deletedAt: now, updatedAt: now, version: currentVersion })
        .where(and(eq(s.records.organizationId, org), inArray(s.records.id, chunk))),
    );
  }
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
  stmts.push(...taskUpdates);
  for (const chunk of chunkForParams(applied, paramsPerRow(s.syncMutations))) {
    stmts.push(db.insert(s.syncMutations).values(chunk).onConflictDoNothing());
  }

  await runBatch(db, stmts);
  return { results };
}
