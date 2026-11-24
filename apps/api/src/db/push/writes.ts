/** Escrituras de un push: una transacción (db.batch), con bumpVersion primero y el orden de siempre. */
import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as s from "@yvy/shared/schema";
import { bumpVersion, chunkForParams, currentVersion, type Stmt } from "../client";
import { recordEffects } from "../erp-effects";
import { auditStmts } from "../audit";
import { mentionStmts } from "../comments";
import { countEffects } from "../inventory-count";
import { funnelEvent } from "../events";
import type { PushCtx } from "./context";

const paramsPerRow = (t: SQLiteTable) => Object.keys(getTableColumns(t)).length;

/** Una sentencia por lote: las geometrías son largas y no conviene agruparlas (igual que createPlots). */
function plotStmts(ctx: PushCtx): Stmt[] {
  const { db, org, now, out } = ctx;
  const stmts: Stmt[] = out.plotUpserts.map((p) =>
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
  if (out.plotUpserts.some((p) => !ctx.knownPlotIds.has(p.id))) stmts.push(funnelEvent(db, "plots_created", org, now));
  return stmts;
}

function poiStmts({ db, out }: PushCtx): Stmt[] {
  return chunkForParams(out.poiUpserts, paramsPerRow(s.pointsOfInterest)).map((chunk) =>
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

/** Registros: altas, auditoría y borrados lógicos. */
function recordStmts({ db, org, userId, deviceId, now, out }: PushCtx): Stmt[] {
  const upserts = chunkForParams(out.recordUpserts, paramsPerRow(s.records)).map((chunk) =>
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
  // El borrado de un registro deja quién y cuándo (en una o pocas sentencias)
  const audit = auditStmts(
    db,
    { userId, orgId: org },
    out.recordDeletes.map((id) => ({ action: "record_delete", entity: "record" as const, entityId: id, detail: { deviceId } })),
    now,
  );
  const deletes = chunkForParams(out.recordDeletes, 1).map((chunk) =>
    db
      .update(s.records)
      .set({ deletedAt: now, updatedAt: now, version: currentVersion })
      .where(and(eq(s.records.organizationId, org), inArray(s.records.id, chunk))),
  );
  return [...upserts, ...audit, ...deletes];
}

function attachmentStmts({ db, org, now, out }: PushCtx): Stmt[] {
  const upserts = chunkForParams(out.attachmentUpserts, paramsPerRow(s.attachments)).map((chunk) =>
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
  const deletes = chunkForParams(out.attachmentDeletes, 1).map((chunk) =>
    db
      .update(s.attachments)
      .set({ deletedAt: now, updatedAt: now, version: currentVersion })
      .where(and(eq(s.attachments.organizationId, org), inArray(s.attachments.id, chunk))),
  );
  return [...upserts, ...deletes];
}

async function commentStmts({ db, org, now, out }: PushCtx): Promise<Stmt[]> {
  const upserts = chunkForParams(out.commentUpserts, paramsPerRow(s.comments)).map((chunk) =>
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
  const deletes = chunkForParams(out.commentDeletes, 1).map((chunk) =>
    db
      .update(s.comments)
      .set({ deletedAt: now, updatedAt: now, version: currentVersion })
      .where(and(eq(s.comments.organizationId, org), inArray(s.comments.id, chunk))),
  );
  return [...upserts, ...deletes, ...(await mentionStmts(db, out.mentionRows, now))];
}

/** Convierte lo decidido en el contexto en las sentencias de escritura del batch, con su versión. */
export async function buildWrites(ctx: PushCtx): Promise<Stmt[]> {
  const { sdb, db, org, now, out } = ctx;
  const touchesSynced =
    out.recordUpserts.length +
      out.recordDeletes.length +
      out.attachmentUpserts.length +
      out.attachmentDeletes.length +
      out.poiUpserts.length +
      out.plotUpserts.length +
      out.commentUpserts.length +
      out.commentDeletes.length +
      out.taskUpdates.length >
    0;
  const stmts: Stmt[] = [];
  if (touchesSynced) stmts.push(bumpVersion(db));
  // Primer registro de la organización (una sentencia; no hace nada si ya existe)
  if (out.recordUpserts.length) stmts.push(funnelEvent(db, "first_record", org, now));
  stmts.push(...plotStmts(ctx), ...poiStmts(ctx), ...recordStmts(ctx));
  // ERP: consumo de insumos y costo de los registros que llegan, y reversión de los que se borran.
  stmts.push(...(await recordEffects(sdb, out.effectUpserts, out.recordDeletes)));
  // ERP: ajustes de stock de los recuentos de depósito.
  stmts.push(...(await countEffects(sdb, out.effectUpserts, out.recordDeletes)));
  stmts.push(...attachmentStmts(ctx), ...(await commentStmts(ctx)), ...out.taskUpdates);
  for (const chunk of chunkForParams(out.applied, paramsPerRow(s.syncMutations))) {
    stmts.push(db.insert(s.syncMutations).values(chunk).onConflictDoNothing());
  }
  return stmts;
}
