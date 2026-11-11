/**
 * Modo dueño (F-29): el resumen del campo que ve quien no es empleado. Lógica pura sobre lo que ya bajó al celular
 * (registros de todos, estadísticas de vigor, avisos), así anda sin señal.
 */
import { LIMITS, t } from "@yvy/shared";

/** Dueño, administrador y agrónomo ven todo el campo; el empleado, solo lo suyo. */
export const isOwnerMode = (role: string | null | undefined): boolean => !!role && role !== "worker";

export interface VigorPass {
  plotId: string;
  mean: number;
  acquiredAt: number;
}

export interface VigorDrop {
  plotId: string;
  /** Caída redondeada, en %. */
  pct: number;
  /** Fecha de la pasada anterior (epoch ms). */
  since: number;
}

/**
 * Lotes cuyo vigor cayó más que el umbral entre sus dos últimas pasadas (la misma regla que la web).
 * `passes` puede traer cualquier cantidad de pasadas por lote, en cualquier orden.
 */
export function vigorDrops(passes: VigorPass[], thresholdPct: number = LIMITS.vigor.dropThresholdPct): VigorDrop[] {
  const byPlot = new Map<string, VigorPass[]>();
  for (const p of passes) byPlot.set(p.plotId, [...(byPlot.get(p.plotId) ?? []), p]);
  const out: VigorDrop[] = [];
  for (const [plotId, list] of byPlot) {
    const [cur, prev] = list.sort((a, b) => b.acquiredAt - a.acquiredAt);
    if (!cur || !prev || prev.mean <= 0) continue;
    const pct = ((prev.mean - cur.mean) / prev.mean) * 100;
    if (pct > thresholdPct) out.push({ plotId, pct: Math.round(pct), since: prev.acquiredAt });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

export interface AuthorCount {
  authorId: string;
  count: number;
}

/** Cuántos registros anotó cada persona desde `sinceMs`, de más a menos. */
export function recordsByAuthor(records: { authorId: string; capturedAt: number }[], sinceMs: number): AuthorCount[] {
  const n = new Map<string, number>();
  for (const r of records) if (r.capturedAt >= sinceMs) n.set(r.authorId, (n.get(r.authorId) ?? 0) + 1);
  return [...n.entries()].map(([authorId, count]) => ({ authorId, count })).sort((a, b) => b.count - a.count || a.authorId.localeCompare(b.authorId));
}

/** Nombre para mostrar de quien anotó: "Vos" para uno mismo y un texto neutro si el nombre todavía no bajó. */
export function authorName(authorId: string, me: string | undefined, names: Record<string, string>): string {
  if (authorId === me) return t("app.authorYou");
  return names[authorId] ?? t("app.authorUnknown");
}
