/**
 * Combustible (E-16): consumo por máquina a partir de los registros `fuel_load` (litros y horómetro u odómetro).
 * Las cargas descuentan stock y cargan costo por el consumo automático (erp-effects.ts); esto es el informe.
 */
import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { LIMITS, noonAsuncion } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { can, type ScopedDb } from "./scoped";

interface Load {
  liters: number;
  meter: number | null;
  at: number;
}

export interface MachineFuel {
  machineId: string | null;
  name: string;
  meterKind: "hours" | "km";
  loads: number;
  liters: number;
  /** Primera y última lectura del horómetro u odómetro entre las cargas del período. */
  firstMeter: number | null;
  lastMeter: number | null;
  /** Litros por hora (o por 100 km) entre la primera y la última lectura; null si faltan lecturas. */
  litersPerUnit: number | null;
}

/**
 * Consumo entre lecturas: se asume que cada carga repone lo gastado desde la anterior ("tanque a tanque"),
 * así que los litros de la primera carga con lectura no cuentan. Litros por hora; para vehículos, por 100 km.
 */
export function fuelRate(loads: Load[], meterKind: "hours" | "km"): number | null {
  const withMeter = loads.filter((l) => l.meter !== null).sort((a, b) => (a.meter as number) - (b.meter as number) || a.at - b.at);
  if (withMeter.length < 2) return null;
  const delta = (withMeter.at(-1)!.meter as number) - (withMeter[0]!.meter as number);
  if (delta <= 0) return null;
  const liters = withMeter.slice(1).reduce((a, l) => a + l.liters, 0);
  const perUnit = (liters / delta) * (meterKind === "km" ? 100 : 1);
  return Math.round(perUnit * 100) / 100;
}

export async function fuelReport(sdb: ScopedDb, f: { farmId?: string; from?: string; to?: string }): Promise<MachineFuel[]> {
  sdb.require(can.viewStock);
  const org = sdb.auth.orgId;
  const [rows, machines] = await Promise.all([
    sdb.db
      .select({
        machineId: sql<string | null>`json_extract(${s.records.data}, '$.machineId')`,
        name: sql<string | null>`json_extract(${s.records.data}, '$.machine')`,
        liters: sql<number>`json_extract(${s.records.data}, '$.liters')`,
        meter: sql<number | null>`json_extract(${s.records.data}, '$.meterValue')`,
        at: s.records.capturedAt,
      })
      .from(s.records)
      .where(
        and(
          eq(s.records.organizationId, org),
          eq(s.records.kind, "fuel_load"),
          isNull(s.records.deletedAt),
          f.farmId ? eq(s.records.farmId, f.farmId) : undefined,
          f.from ? gte(s.records.capturedAt, noonAsuncion(f.from) - 12 * 3_600_000) : undefined,
          f.to ? lte(s.records.capturedAt, noonAsuncion(f.to) + 12 * 3_600_000 - 1) : undefined,
        ),
      )
      .orderBy(asc(s.records.capturedAt))
      .limit(LIMITS.erp.listLimit * 7),
    sdb.db
      .select({ id: s.machines.id, name: s.machines.name, meterKind: s.machines.meterKind })
      .from(s.machines)
      .where(and(eq(s.machines.organizationId, org), isNull(s.machines.deletedAt))),
  ]);
  const catalog = new Map(machines.map((m) => [m.id, m]));
  const groups = new Map<string, { machineId: string | null; name: string; loads: Load[] }>();
  for (const r of rows) {
    const known = r.machineId ? catalog.get(r.machineId) : undefined;
    const name = known?.name ?? r.name ?? "?";
    const key = known ? known.id : `n:${name.toLowerCase()}`;
    const g = groups.get(key) ?? { machineId: known?.id ?? null, name, loads: [] };
    g.loads.push({ liters: r.liters, meter: r.meter, at: r.at });
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g): MachineFuel => {
      const meterKind = (g.machineId ? catalog.get(g.machineId)?.meterKind : undefined) ?? "hours";
      const meters = g.loads.map((l) => l.meter).filter((m): m is number => m !== null);
      return {
        machineId: g.machineId,
        name: g.name,
        meterKind,
        loads: g.loads.length,
        liters: Math.round(g.loads.reduce((a, l) => a + l.liters, 0) * 100) / 100,
        firstMeter: meters.length ? Math.min(...meters) : null,
        lastMeter: meters.length ? Math.max(...meters) : null,
        litersPerUnit: fuelRate(g.loads, meterKind),
      };
    })
    .sort((a, b) => b.liters - a.liters);
}
