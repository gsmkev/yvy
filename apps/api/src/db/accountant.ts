/**
 * Exportación al contador (E-38): libro de movimientos con la cuenta del plan del contador, cuentas a pagar y a cobrar.
 * El Worker solo arma las filas (JSON); el Excel se genera en el navegador (el plan gratis no admite ese CPU).
 * Solo dueño y administrador.
 */
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { accountFor, COST_CATEGORIES, LIMITS, localDate, newId, noonAsuncion, type AccountRef, type CostCategory } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { dues } from "./cash";
import { can, NotFoundError, type ScopedDb } from "./scoped";

export async function listMap(sdb: ScopedDb) {
  sdb.require(can.manageErp);
  const rows = await sdb.db.select().from(s.accountMap).where(eq(s.accountMap.organizationId, sdb.auth.orgId));
  return COST_CATEGORIES.map((key) => {
    const custom = rows.find((r) => r.key === key);
    return { key, ...accountFor(key, custom ? { [key]: { code: custom.code, name: custom.name } } : {}), custom: !!custom };
  });
}

export async function saveMap(sdb: ScopedDb, key: string, i: AccountRef) {
  sdb.require(can.manageErp);
  if (!(COST_CATEGORIES as readonly string[]).includes(key)) throw new HTTPException(400, { message: "Rubro desconocido" });
  await sdb.db
    .insert(s.accountMap)
    .values({ id: newId(), organizationId: sdb.auth.orgId, key, code: i.code, name: i.name, updatedBy: sdb.auth.userId, updatedAt: sdb.now() })
    .onConflictDoUpdate({
      target: [s.accountMap.organizationId, s.accountMap.key],
      set: { code: i.code, name: i.name, updatedBy: sdb.auth.userId, updatedAt: sdb.now() },
    });
}

/** Vuelve al plan de ejemplo para un rubro. */
export async function resetMap(sdb: ScopedDb, key: string) {
  sdb.require(can.manageErp);
  const where = and(eq(s.accountMap.organizationId, sdb.auth.orgId), eq(s.accountMap.key, key));
  const [row] = await sdb.db.select({ id: s.accountMap.id }).from(s.accountMap).where(where).limit(1);
  if (!row) throw new NotFoundError("Ese rubro ya usa el plan de ejemplo");
  await sdb.db.delete(s.accountMap).where(where);
}

export async function accountantExport(sdb: ScopedDb, f: { from?: string; to?: string }) {
  sdb.require(can.manageErp);
  const org = sdb.auth.orgId;
  const ce = s.costEntries;
  const [entries, custom, parties, farms, payables, receivables] = await Promise.all([
    sdb.db
      .select()
      .from(ce)
      .where(
        and(
          eq(ce.organizationId, org),
          isNull(ce.deletedAt),
          f.from ? gte(ce.occurredAt, noonAsuncion(f.from) - 12 * 3_600_000) : undefined,
          f.to ? lte(ce.occurredAt, noonAsuncion(f.to) + 12 * 3_600_000 - 1) : undefined,
        ),
      )
      .orderBy(asc(ce.occurredAt))
      .limit(LIMITS.erp.exportLimit + 1),
    sdb.db.select().from(s.accountMap).where(eq(s.accountMap.organizationId, org)),
    sdb.db.select({ id: s.parties.id, name: s.parties.name, ruc: s.parties.ruc }).from(s.parties).where(and(eq(s.parties.organizationId, org))),
    sdb.db.select({ id: s.farms.id, name: s.farms.name }).from(s.farms).where(and(eq(s.farms.organizationId, org))),
    dues(sdb, "payable"),
    dues(sdb, "receivable"),
  ]);
  const map: Record<string, AccountRef> = Object.fromEntries(custom.map((r) => [r.key, { code: r.code, name: r.name }]));
  const party = new Map(parties.map((p) => [p.id, p]));
  const farm = new Map(farms.map((x) => [x.id, x.name]));
  const truncated = entries.length > LIMITS.erp.exportLimit;
  return {
    truncated,
    ledger: entries.slice(0, LIMITS.erp.exportLimit).map((e) => {
      const acc = accountFor(e.category as CostCategory, map);
      const p = e.partyId ? party.get(e.partyId) : undefined;
      return {
        date: localDate(e.occurredAt),
        type: e.category === "sale" ? "income" : "cost",
        accountCode: acc.code,
        accountName: acc.name,
        description: e.description ?? "",
        party: p?.name ?? "",
        ruc: p?.ruc ?? "",
        farm: e.farmId ? (farm.get(e.farmId) ?? "") : "",
        activity: e.activity,
        currency: e.currency,
        amount: e.amount,
        amountPyg: e.amountPyg,
        origin: e.origin,
      };
    }),
    payables: payables.rows.map((r) => ({ ...r, party: r.partyId ? (party.get(r.partyId)?.name ?? "") : "", ruc: r.partyId ? (party.get(r.partyId)?.ruc ?? "") : "" })),
    receivables: receivables.rows.map((r) => ({ ...r, party: r.partyId ? (party.get(r.partyId)?.name ?? "") : "", ruc: r.partyId ? (party.get(r.partyId)?.ruc ?? "") : "" })),
  };
}
