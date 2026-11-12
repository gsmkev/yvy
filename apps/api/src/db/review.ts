/**
 * X-26: registros raros para revisar. Las reglas viven en packages/shared/src/oddities.ts y se evalúan al listar, sobre
 * los registros de los últimos LIMITS.oddities.windowDays días (así no suman consultas al push del celular ni
 * al presupuesto de 10 ms por pedido). "Está bien" se guarda aparte y vale hasta que el registro se edite.
 */
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { LIMITS, recordOddities, type DoseRange, type Oddity } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { can, ForbiddenError, NotFoundError, type ScopedDb } from "./scoped";

const KINDS = ["rain", "pest", "application", "harvest"] as const;
const MSG = "Solo quien no es de campo revisa registros";

export async function doseRanges(sdb: ScopedDb): Promise<Map<string, DoseRange>> {
  const rows = await sdb.db
    .select({ id: s.productDoseRanges.productId, min: s.productDoseRanges.minDose, max: s.productDoseRanges.maxDose, unit: s.products.unit })
    .from(s.productDoseRanges)
    .innerJoin(s.products, eq(s.products.id, s.productDoseRanges.productId))
    .where(and(eq(s.productDoseRanges.organizationId, sdb.auth.orgId), isNull(s.products.deletedAt)))
    .limit(500);
  return new Map(rows.map((r) => [r.id, { min: r.min, max: r.max, unit: r.unit }]));
}

export async function listDoseRanges(sdb: ScopedDb) {
  const rows = await sdb.db
    .select({ productId: s.productDoseRanges.productId, min: s.productDoseRanges.minDose, max: s.productDoseRanges.maxDose })
    .from(s.productDoseRanges)
    .where(eq(s.productDoseRanges.organizationId, sdb.auth.orgId))
    .limit(500);
  return rows;
}

/** Dosis habitual de un producto (l/ha o kg/ha según su unidad). Con los dos topes en null se quita. */
export async function setDoseRange(sdb: ScopedDb, productId: string, min: number | null, max: number | null) {
  sdb.require(can.editProducts);
  if (sdb.auth.readOnly) throw new ForbiddenError("Sesión de solo lectura");
  const [p] = await sdb.db
    .select({ id: s.products.id })
    .from(s.products)
    .where(and(eq(s.products.id, productId), eq(s.products.organizationId, sdb.auth.orgId), isNull(s.products.deletedAt)))
    .limit(1);
  if (!p) throw new NotFoundError("Producto inexistente");
  if (min === null && max === null) {
    await sdb.db.delete(s.productDoseRanges).where(eq(s.productDoseRanges.productId, productId));
    return;
  }
  const row = { organizationId: sdb.auth.orgId, minDose: min, maxDose: max, updatedAt: sdb.now() };
  await sdb.db
    .insert(s.productDoseRanges)
    .values({ productId, ...row })
    .onConflictDoUpdate({ target: s.productDoseRanges.productId, set: row });
}

export interface ReviewItem {
  recordId: string;
  farmId: string;
  farmName: string;
  plotName: string | null;
  authorName: string | null;
  kind: string;
  capturedAt: number;
  data: unknown;
  oddities: Oddity[];
  /** El registro completo, con la misma forma que /org/records, para abrirlo y editarlo desde la lista. */
  record: Record<string, unknown>;
}

export async function listReview(sdb: ScopedDb, now = sdb.now()): Promise<ReviewItem[]> {
  sdb.require(can.reviewRecords, MSG);
  const since = now - LIMITS.oddities.windowDays * 86_400_000;
  const [rows, ranges] = await Promise.all([
    sdb.db
      .select({
        r: s.records,
        authorName: s.users.fullName,
        farmName: s.farms.name,
        plotName: s.plots.name,
        plotCrop: s.plots.crop,
        plotArea: s.plots.areaHa,
        reviewedAt: s.recordReviews.reviewedAt,
        attachments: sql<string>`(SELECT json_group_array(json_object('id', a.id, 'uploadStatus', a.upload_status, 'mime', a.mime)) FROM attachments a WHERE a.record_id = ${s.records.id} AND a.deleted_at IS NULL)`,
      })
      .from(s.records)
      .innerJoin(s.farms, eq(s.farms.id, s.records.farmId))
      .leftJoin(s.users, eq(s.users.id, s.records.authorId))
      .leftJoin(s.plots, eq(s.plots.id, s.records.plotId))
      .leftJoin(s.recordReviews, eq(s.recordReviews.recordId, s.records.id))
      .where(
        and(
          eq(s.records.organizationId, sdb.auth.orgId),
          isNull(s.records.deletedAt),
          inArray(s.records.kind, [...KINDS]),
          gte(s.records.capturedAt, since),
          sdb.workerFilter("records"),
        ),
      )
      .orderBy(desc(s.records.capturedAt), desc(s.records.id))
      .limit(LIMITS.oddities.maxCandidates),
    doseRanges(sdb),
  ]);
  const out: ReviewItem[] = [];
  for (const x of rows) {
    // "Está bien" vale hasta que alguien edite el registro
    if (x.reviewedAt !== null && x.r.updatedAt <= x.reviewedAt) continue;
    const data = JSON.parse(x.r.data) as unknown;
    const oddities = recordOddities(x.r.kind, data, x.r.capturedAt, {
      plot: x.plotArea !== null ? { crop: x.plotCrop, areaHa: x.plotArea } : null,
      doseRanges: ranges,
    });
    if (!oddities.length) continue;
    out.push({
      recordId: x.r.id,
      farmId: x.r.farmId,
      farmName: x.farmName,
      plotName: x.plotName,
      authorName: x.authorName,
      kind: x.r.kind,
      capturedAt: x.r.capturedAt,
      data,
      oddities,
      record: {
        ...x.r,
        data,
        authorName: x.authorName,
        plotName: x.plotName,
        attachments: JSON.parse(x.attachments) as unknown,
      },
    });
  }
  return out;
}

/** "Está bien": el registro sale del listado hasta que se edite. */
export async function markReviewed(sdb: ScopedDb, recordId: string) {
  sdb.require(can.reviewRecords, MSG);
  if (sdb.auth.readOnly) throw new ForbiddenError("Sesión de solo lectura");
  const [rec] = await sdb.db
    .select({ id: s.records.id })
    .from(s.records)
    .where(
      and(
        eq(s.records.id, recordId),
        eq(s.records.organizationId, sdb.auth.orgId),
        isNull(s.records.deletedAt),
        sdb.workerFilter("records"),
      ),
    )
    .limit(1);
  if (!rec) throw new NotFoundError("Registro inexistente");
  const row = { organizationId: sdb.auth.orgId, reviewedBy: sdb.auth.userId, reviewedAt: sdb.now() };
  await sdb.db
    .insert(s.recordReviews)
    .values({ recordId, ...row })
    .onConflictDoUpdate({ target: s.recordReviews.recordId, set: row });
}
