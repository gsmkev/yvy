/**
 * Costos y ventas (E-05): una fila por gasto o ingreso con su centro de costo (estancia, lote, campaña, actividad).
 * Solo dueño y administrador: el agrónomo no ve montos (ADR 0004).
 */
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { LIMITS, newId, noonAsuncion, toPyg, type Activity, type CostCategory, type Currency } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { requireOwned, usdRateOn } from "./erp";
import { can, NotFoundError, type ScopedDb } from "./scoped";

export interface CostInput {
  date: string;
  farmId?: string | null;
  plotId?: string | null;
  seasonId?: string | null;
  activity: Activity;
  category: CostCategory;
  description?: string | null;
  amount: number;
  currency: Currency;
  partyId?: string | null;
  tons?: number | null;
}

/** Valida que lote, estancia, campaña y tercero sean de la organización. Un lote fija su estancia. */
async function resolveCenter(sdb: ScopedDb, v: Pick<CostInput, "farmId" | "plotId" | "seasonId" | "partyId">) {
  let farmId = v.farmId ?? null;
  if (v.plotId) {
    const [p] = await sdb.db
      .select({ farmId: s.plots.farmId })
      .from(s.plots)
      .where(and(eq(s.plots.id, v.plotId), eq(s.plots.organizationId, sdb.auth.orgId), isNull(s.plots.deletedAt)))
      .limit(1);
    if (!p) throw new NotFoundError("Lote inexistente");
    if (farmId && farmId !== p.farmId) throw new HTTPException(400, { message: "El lote no es de esa estancia" });
    farmId = p.farmId;
  } else if (farmId) await sdb.requireFarm(farmId);
  if (v.seasonId) await requireOwned(sdb, s.seasons, v.seasonId, "La campaña");
  if (v.partyId) await requireOwned(sdb, s.parties, v.partyId, "El tercero");
  return { farmId, plotId: v.plotId ?? null, seasonId: v.seasonId ?? null, partyId: v.partyId ?? null };
}

/** Valor en guaraníes con el tipo de cambio de la fecha; sin tipo de cambio no se registra un monto en dólares. */
export async function pygOf(sdb: ScopedDb, amount: number, currency: Currency, day: string): Promise<number> {
  if (currency === "PYG") return amount;
  const pyg = toPyg(amount, currency, await usdRateOn(sdb, day));
  if (pyg === null) throw new HTTPException(400, { message: "Cargá el tipo de cambio del dólar antes de registrar montos en USD" });
  return pyg;
}

export interface CostFilter {
  farmId?: string;
  plotId?: string;
  seasonId?: string;
  category?: CostCategory;
  from?: string;
  to?: string;
}

const where = (sdb: ScopedDb, f: CostFilter) =>
  and(
    eq(s.costEntries.organizationId, sdb.auth.orgId),
    isNull(s.costEntries.deletedAt),
    f.farmId ? eq(s.costEntries.farmId, f.farmId) : undefined,
    f.plotId ? eq(s.costEntries.plotId, f.plotId) : undefined,
    f.seasonId ? eq(s.costEntries.seasonId, f.seasonId) : undefined,
    f.category ? eq(s.costEntries.category, f.category) : undefined,
    f.from ? gte(s.costEntries.occurredAt, noonAsuncion(f.from) - 12 * 3_600_000) : undefined,
    f.to ? lte(s.costEntries.occurredAt, noonAsuncion(f.to) + 12 * 3_600_000 - 1) : undefined,
  );

/** Costos y ventas del filtro (más recientes primero) y los totales en guaraníes de todo lo que coincide. */
export async function listCosts(sdb: ScopedDb, f: CostFilter) {
  sdb.require(can.manageErp);
  const w = where(sdb, f);
  const [rows, [tot]] = await Promise.all([
    sdb.db.select().from(s.costEntries).where(w).orderBy(desc(s.costEntries.occurredAt)).limit(LIMITS.erp.listLimit),
    sdb.db
      .select({
        costPyg: sql<number>`COALESCE(SUM(CASE WHEN ${s.costEntries.category} <> 'sale' THEN ${s.costEntries.amountPyg} END), 0)`,
        incomePyg: sql<number>`COALESCE(SUM(CASE WHEN ${s.costEntries.category} = 'sale' THEN ${s.costEntries.amountPyg} END), 0)`,
      })
      .from(s.costEntries)
      .where(w),
  ]);
  return { rows, totals: { costPyg: tot?.costPyg ?? 0, incomePyg: tot?.incomePyg ?? 0 } };
}

export async function createCost(sdb: ScopedDb, input: CostInput) {
  sdb.require(can.manageErp);
  const center = await resolveCenter(sdb, input);
  const amountPyg = await pygOf(sdb, input.amount, input.currency, input.date);
  const id = newId();
  const ts = sdb.now();
  await sdb.db.insert(s.costEntries).values({
    id,
    organizationId: sdb.auth.orgId,
    occurredAt: noonAsuncion(input.date),
    ...center,
    activity: input.activity,
    category: input.category,
    description: input.description?.trim() || null,
    amount: input.amount,
    currency: input.currency,
    amountPyg,
    tons: input.category === "sale" ? (input.tons ?? null) : null,
    origin: "manual",
    createdBy: sdb.auth.userId,
    createdAt: ts,
    updatedAt: ts,
  });
  return { id };
}

async function manualEntry(sdb: ScopedDb, id: string) {
  const [row] = await sdb.db
    .select()
    .from(s.costEntries)
    .where(and(eq(s.costEntries.id, id), eq(s.costEntries.organizationId, sdb.auth.orgId), isNull(s.costEntries.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError("No existe");
  // Lo que nace de un registro de campo se corrige en el registro: se recalcula solo.
  if (row.origin !== "manual")
    throw new HTTPException(409, { message: "Este costo lo generó un registro de campo: corregí el registro" });
  return row;
}

export async function updateCost(sdb: ScopedDb, id: string, patch: Partial<CostInput>) {
  sdb.require(can.manageErp);
  const cur = await manualEntry(sdb, id);
  const next = {
    date: patch.date ?? new Date(cur.occurredAt).toISOString().slice(0, 10),
    amount: patch.amount ?? cur.amount,
    currency: patch.currency ?? cur.currency,
  };
  const center = await resolveCenter(sdb, {
    farmId: patch.plotId !== undefined ? patch.farmId : (patch.farmId ?? cur.farmId),
    plotId: patch.plotId !== undefined ? patch.plotId : cur.plotId,
    seasonId: patch.seasonId !== undefined ? patch.seasonId : cur.seasonId,
    partyId: patch.partyId !== undefined ? patch.partyId : cur.partyId,
  });
  const category = patch.category ?? cur.category;
  await sdb.db
    .update(s.costEntries)
    .set({
      ...center,
      occurredAt: patch.date ? noonAsuncion(patch.date) : cur.occurredAt,
      activity: patch.activity ?? cur.activity,
      category,
      description: patch.description === undefined ? cur.description : patch.description?.trim() || null,
      amount: next.amount,
      currency: next.currency,
      amountPyg: await pygOf(sdb, next.amount, next.currency, next.date),
      tons: category === "sale" ? (patch.tons === undefined ? cur.tons : patch.tons) : null,
      updatedAt: sdb.now(),
    })
    .where(eq(s.costEntries.id, id));
}

export async function deleteCost(sdb: ScopedDb, id: string) {
  sdb.require(can.manageErp);
  await manualEntry(sdb, id);
  const ts = sdb.now();
  await sdb.db.update(s.costEntries).set({ deletedAt: ts, updatedAt: ts }).where(eq(s.costEntries.id, id));
}
