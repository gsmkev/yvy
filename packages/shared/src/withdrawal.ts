/**
 * Período de carencia antes de cosechar (A-14): días que tienen que pasar entre la última aplicación de un producto
 * y la cosecha. Función pura sobre las aplicaciones de un lote y los días de carencia del catálogo de productos.
 */
import { addDays } from "./tasks";

export interface WithdrawalApplication {
  plotId: string;
  /** Fecha local de la aplicación (YYYY-MM-DD). */
  date: string;
  /** Productos con su carencia en días (null = el catálogo no la tiene o el producto se escribió a mano). */
  products: { name: string; withdrawalDays: number | null }[];
}

export interface WithdrawalRestriction {
  plotId: string;
  /** Primer día en que se puede cosechar. */
  safeFrom: string;
  /** Días que faltan desde hoy (>= 1 mientras la restricción está vigente). */
  daysLeft: number;
  product: string;
  appliedOn: string;
}

export interface WithdrawalViolation {
  plotId: string;
  harvestedOn: string;
  safeFrom: string;
  product: string;
  appliedOn: string;
}

export interface WithdrawalReport {
  /** Una por lote: la que más tarde libera la cosecha. Solo las vigentes. */
  restrictions: WithdrawalRestriction[];
  /** Cosechas hechas antes de que se cumpliera la carencia de una aplicación anterior. */
  violations: WithdrawalViolation[];
  /** Aplicaciones recientes con productos sin carencia cargada: no se pudo controlar. */
  unknown: { plotId: string; product: string; appliedOn: string }[];
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * `today` y las fechas en el mismo huso. Una aplicación posterior a una cosecha no la afecta (se compara por fecha;
 * el mismo día cuenta como anterior: aplicar y cosechar el mismo día sigue incumpliendo la carencia).
 */
export function withdrawalReport(
  applications: WithdrawalApplication[],
  harvests: { plotId: string; date: string }[],
  today: string,
): WithdrawalReport {
  const restrictions = new Map<string, WithdrawalRestriction>();
  const violations: WithdrawalViolation[] = [];
  const seenViolation = new Set<string>();
  const unknown: WithdrawalReport["unknown"] = [];
  const seenUnknown = new Set<string>();
  for (const app of applications) {
    for (const p of app.products) {
      if (p.withdrawalDays === null) {
        const key = `${app.plotId}|${p.name}`;
        if (!seenUnknown.has(key)) {
          seenUnknown.add(key);
          unknown.push({ plotId: app.plotId, product: p.name, appliedOn: app.date });
        }
        continue;
      }
      if (p.withdrawalDays === 0) continue;
      const safeFrom = addDays(app.date, p.withdrawalDays);
      if (safeFrom > today) {
        const cur = restrictions.get(app.plotId);
        if (!cur || safeFrom > cur.safeFrom)
          restrictions.set(app.plotId, {
            plotId: app.plotId,
            safeFrom,
            daysLeft: dayDiff(today, safeFrom),
            product: p.name,
            appliedOn: app.date,
          });
      }
      for (const h of harvests) {
        if (h.plotId !== app.plotId || h.date < app.date || h.date >= safeFrom) continue;
        const key = `${h.plotId}|${h.date}|${p.name}`;
        if (seenViolation.has(key)) continue;
        seenViolation.add(key);
        violations.push({ plotId: h.plotId, harvestedOn: h.date, safeFrom, product: p.name, appliedOn: app.date });
      }
    }
  }
  return {
    restrictions: [...restrictions.values()].sort((a, b) => a.safeFrom.localeCompare(b.safeFrom)),
    violations: violations.sort((a, b) => b.harvestedOn.localeCompare(a.harvestedOn)),
    unknown,
  };
}
