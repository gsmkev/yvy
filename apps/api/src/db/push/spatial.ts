/** Puntos de interés y lotes: los dos se crean y editan desde el celular con `upsert`. */
import { LIMITS, type Mutation } from "@yvy/shared";
import { bboxOf } from "@yvy/geo";
import { can } from "../scoped";
import type { PushCtx } from "./context";

type Of<K extends Mutation["kind"]> = Extract<Mutation, { kind: K }>;

export function poisUpsert(ctx: PushCtx, m: Of<"pois.upsert">): void {
  const p = m.row;
  const { now, org } = ctx;
  if (!can.editPoi(ctx.role)) return ctx.reject(m, "forbidden", "poi");
  if (ctx.foreignPois.has(p.id)) return ctx.reject(m, "not_found");
  const knownFarm = ctx.pois.get(p.id);
  // Existe (de esta organización) pero en otra estancia: no se mueve de estancia.
  if (knownFarm !== undefined && knownFarm !== p.farmId) return ctx.reject(m, "invalid", "farm");
  if (ctx.deletedPois.has(p.id)) return ctx.reject(m, "deleted");
  if (!ctx.farms.has(p.farmId) || !ctx.farmWritable(p.farmId)) return ctx.reject(m, "forbidden", "farm");
  ctx.out.poiUpserts.push({ id: p.id, organizationId: org, farmId: p.farmId, kind: p.kind, name: p.name, lon: p.lon, lat: p.lat, createdAt: now, updatedAt: now });
  ctx.pois.set(p.id, p.farmId);
  ctx.accept(m, p.id);
}

export function plotsUpsert(ctx: PushCtx, m: Of<"plots.upsert">): void {
  const p = m.row;
  const { now, org } = ctx;
  if (!can.editField(ctx.role)) return ctx.reject(m, "forbidden", "plot");
  const known = ctx.plotState.get(p.id);
  if (known && known.organizationId !== org) return ctx.reject(m, "not_found");
  if (known?.deletedAt) return ctx.reject(m, "deleted");
  if (known && known.farmId !== p.farmId) return ctx.reject(m, "invalid", "farm");
  if (!ctx.farms.has(p.farmId)) return ctx.reject(m, "forbidden", "farm");
  const geo = ctx.parsedPlots.get(p.id);
  if (!geo || geo.ha < LIMITS.geometry.minPlotHa) return ctx.reject(m, "invalid", geo ? "area" : "geometry");
  if (!known && ctx.planBlocked) return ctx.reject(m, "forbidden", "plan");
  ctx.out.plotUpserts.push({
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
  ctx.plots.set(p.id, p.farmId);
  // Si se repite el mismo lote en el push, el último gana y no se vuelve a contar como nuevo
  ctx.plotState.set(p.id, { id: p.id, organizationId: org, farmId: p.farmId, deletedAt: null });
  ctx.accept(m, p.id);
}
