import { ORDER_LABOR_KIND, type RecordKind } from "@yvy/shared";
import type { Plot } from "../db/store";
import { getDb } from "../lib/db";
import { FLOWS } from "../lib/annotate";
import type { Season } from "../db/store";

type Db = ReturnType<typeof getDb>;

export type SeedCtx = {
  db: Db;
  seasons: Season[];
  taskId?: string;
  plot: Plot | null;
  sprayPre: Record<string, unknown> | null;
};

/** A-11: la aplicación hecha desde una tarea sale precargada con la receta del ingeniero. */
function seedPrescription(out: Record<string, unknown>, kd: RecordKind, { db, taskId }: SeedCtx) {
  const rx = kd === "application" && taskId ? db.prescriptionOf(taskId) : null;
  if (!rx) return;
  out.products = rx.products;
  if (rx.volumeLHa) out.volumeLHa = rx.volumeLHa;
  if (rx.seasonId) out.seasonId = rx.seasonId;
  out.prescriptionTaskId = taskId;
}

/** E-21: la orden de trabajo precarga insumos, campaña y superficie prevista; al guardar queda ligada a la tarea. */
function seedOrder(out: Record<string, unknown>, kd: RecordKind, { db, taskId }: SeedCtx) {
  const ord = taskId ? db.orderOf(taskId) : null;
  if (!ord || ORDER_LABOR_KIND[ord.labor] !== kd) return;
  if ((kd === "application" || kd === "fertilization") && ord.products.length) out.products = ord.products;
  if (ord.seasonId) out.seasonId = ord.seasonId;
  if (ord.areaHa) out.areaHa = ord.areaHa;
  if (kd === "application" && ord.volumeLHa) out.volumeLHa = ord.volumeLHa;
  out.orderTaskId = taskId;
}

/** A-01: la siembra sale precargada con el plan del lote en la campaña (cultivo, variedad y densidad). */
function seedSowing(out: Record<string, unknown>, { db, plot }: SeedCtx) {
  if (!plot) return;
  const sid = out.seasonId as string | undefined;
  const plan = sid ? db.plotSeason(plot.id, sid) : null;
  if (plan?.crop && out.crop === undefined) out.crop = plan.crop;
  if (plan?.variety && out.variety === undefined) out.variety = plan.variety;
  if (plan?.sowingDensity && plan.densityUnit && out.density === undefined) {
    out.density = plan.sowingDensity;
    out.densityUnit = plan.densityUnit;
  }
}

/** Valores iniciales de un registro nuevo: campaña única, receta, pronóstico, orden de trabajo y plan del lote. */
export function buildSeed(kd: RecordKind, ctx: SeedCtx): Record<string, unknown> {
  const { seasons, sprayPre } = ctx;
  const out: Record<string, unknown> = seasons.length === 1 && FLOWS[kd].some((x) => x.kind === "season") ? { seasonId: seasons[0]!.id } : {};
  seedPrescription(out, kd, ctx);
  // A-12: viento, temperatura y humedad de esta hora según el pronóstico guardado (editables a mano).
  if (kd === "application") Object.assign(out, sprayPre ?? {});
  seedOrder(out, kd, ctx);
  if (kd === "sowing") seedSowing(out, ctx);
  return out;
}
