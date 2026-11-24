import { LIMITS, RECORD_SCHEMA_VERSION, livestockPlotProblem, parseRecordData, type Mutation, type RejectReason } from "@yvy/shared";
import type * as s from "@yvy/shared/schema";
import { hasEffects } from "../erp-effects";
import { can } from "../scoped";
import type { PushCtx, RecordState } from "./context";

type Of<K extends Mutation["kind"]> = Extract<Mutation, { kind: K }>;
type Problem = [RejectReason, string?] | null;

/** Revisiones previas a parsear `data`: existencia, permisos, estancia, lote, punto y rol. */
function accessProblem(ctx: PushCtx, r: Of<"records.upsert">["row"], existing: RecordState | undefined, now: number): Problem {
  const { sdb } = ctx;
  if (r.capturedAt > now + LIMITS.sync.maxFutureCaptureMs) return ["captured_in_future"];
  if (existing && existing.organizationId !== ctx.org) return ["not_found"];
  if (existing?.deletedAt) return ["deleted"];
  const err = existing ? sdb.canEditRecord(existing) : null;
  if (err) return [err];
  if (!ctx.farms.has(r.farmId) || (sdb.isWorker && !ctx.workerFarms.has(r.farmId)) || !ctx.farmWritable(r.farmId))
    return ["forbidden", "farm"];
  if (r.plotId && (ctx.plots.get(r.plotId) !== r.farmId || (sdb.isWorker && !ctx.assignedPlots.has(r.plotId))))
    return ["forbidden", "plot"];
  if (r.poiId && ctx.pois.get(r.poiId) !== r.farmId) return ["invalid", "poi"];
  if ((r.lon === null) !== (r.lat === null) || r.schemaVersion > RECORD_SCHEMA_VERSION) return ["invalid"];
  // El recuento de depósito es del ERP: el empleado no entra (E-15).
  if (r.kind === "stock_count" && !can.viewStock(ctx.role)) return ["forbidden"];
  // El suministro de raciones (G-33) carga stock y costos: solo dueño y administrador.
  if (r.kind === "feed" && !can.manageErp(ctx.role)) return ["forbidden"];
  return null;
}

/** Revisiones sobre `data` ya parseado: ganadería (potrero y destino del movimiento). */
function dataProblem(ctx: PushCtx, r: Of<"records.upsert">["row"], data: unknown): Problem {
  // Ganadería: el potrero es el del registro; el destino de un movimiento tiene que ser de la misma estancia.
  const livestock = livestockPlotProblem(r.kind, r.plotId, data);
  if (livestock) return ["invalid", livestock];
  const toPlotId = r.kind === "herd_move" ? (data as { toPlotId?: string }).toPlotId : undefined;
  if (toPlotId && (ctx.plots.get(toPlotId) !== r.farmId || (ctx.sdb.isWorker && !ctx.assignedPlots.has(toPlotId))))
    return ["forbidden", "plot"];
  return null;
}

export function recordsUpsert(ctx: PushCtx, m: Of<"records.upsert">): void {
  const r = m.row;
  const { now, org, out } = ctx;
  const existing = ctx.records.get(r.id);
  const access = accessProblem(ctx, r, existing, now);
  if (access) return ctx.reject(m, access[0], access[1]);
  const data = parseRecordData(r.kind, r.data);
  if (!data.success) return ctx.reject(m, "invalid", data.error.issues[0]?.message);
  const problem = dataProblem(ctx, r, data.data);
  if (problem) return ctx.reject(m, problem[0], problem[1]);

  const authorId = existing?.authorId ?? ctx.userId;
  const createdAt = existing?.createdAt ?? now;
  const newRow: typeof s.records.$inferInsert = {
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
    deviceId: ctx.deviceId,
    createdAt,
    updatedAt: now,
  };
  out.recordUpserts.push(newRow);
  if (!existing) ctx.created?.push(newRow);
  ctx.records.set(r.id, { organizationId: org, farmId: r.farmId, authorId, createdAt, deletedAt: null, lon: r.lon, lat: r.lat });
  if (hasEffects(r.kind))
    out.effectUpserts.push({
      id: r.id,
      farmId: r.farmId,
      plotId: r.plotId,
      kind: r.kind,
      data: data.data as Record<string, unknown>,
      capturedAt: r.capturedAt,
    });
  ctx.accept(m, r.id);
}

export function recordsDelete(ctx: PushCtx, m: Of<"records.delete">): void {
  const existing = ctx.records.get(m.row.id);
  if (!existing || existing.organizationId !== ctx.org) return ctx.reject(m, "not_found");
  if (!existing.deletedAt) {
    const err = !ctx.farmWritable(existing.farmId) ? "forbidden" : ctx.sdb.canEditRecord(existing);
    if (err) return ctx.reject(m, err);
    ctx.out.recordDeletes.push(m.row.id);
    existing.deletedAt = ctx.now;
  }
  ctx.accept(m, m.row.id);
}
