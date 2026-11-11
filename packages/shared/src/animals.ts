/**
 * Caravanas (G-21) y pesadas (G-22). Lógica pura compartida por el Worker, la web y la app.
 */
import { z } from "zod";

/** Caravana: letras, números y guiones (ej. "PY-0012345" o "1234"). Se guarda en mayúsculas. */
export const ANIMAL_TAG_RE = /^[A-Za-z0-9-]{1,20}$/;
export const animalTag = z
  .string()
  .trim()
  .regex(ANIMAL_TAG_RE, "La caravana lleva letras, números y guiones (hasta 20)")
  .transform((s) => s.toUpperCase());

export const normalizeTag = (s: string): string => s.trim().toUpperCase();

// ---------- Pesadas y ganancia diaria de peso (G-22) ----------

export const MAX_WEIGHT_KG = 2000;
const DAY_MS = 86_400_000;
/** Dos pesadas con menos de este tiempo entre sí no alcanzan para calcular una ganancia diaria. */
export const MIN_ADG_SPAN_MS = DAY_MS;

export interface WeightPoint {
  at: number;
  /** Peso promedio por cabeza (kg). */
  kg: number;
  /** Animales pesados (1 en una pesada individual). */
  head: number;
}

export interface WeightSeries {
  key: string;
  label: string | null;
  points: WeightPoint[];
  firstAt: number | null;
  lastAt: number | null;
  firstKg: number | null;
  lastKg: number | null;
  gainKg: number | null;
  /** Días entre la primera y la última pesada. */
  days: number | null;
  /** Ganancia diaria de peso (kg/cabeza/día) entre la primera y la última pesada; null con una sola pesada. */
  adgKg: number | null;
  /** Ganancia diaria entre las dos últimas pesadas: la tendencia reciente. */
  lastAdgKg: number | null;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Una pesada por día de Paraguay (UTC-3): varias del mismo día se promedian ponderando por cabezas. */
export function collapseDays(points: readonly WeightPoint[]): WeightPoint[] {
  const byDay = new Map<number, { at: number; kgSum: number; head: number }>();
  for (const p of [...points].sort((a, b) => a.at - b.at)) {
    const day = Math.floor((p.at - 3 * 3_600_000) / DAY_MS);
    const cur = byDay.get(day);
    if (cur) {
      cur.kgSum += p.kg * p.head;
      cur.head += p.head;
      cur.at = p.at;
    } else byDay.set(day, { at: p.at, kgSum: p.kg * p.head, head: p.head });
  }
  return [...byDay.values()].map((d) => ({ at: d.at, kg: round3(d.kgSum / d.head), head: d.head }));
}

/** Serie con ganancia diaria de peso: (peso final − peso inicial) / días. */
export function weightSeries(key: string, label: string | null, raw: readonly WeightPoint[]): WeightSeries {
  const points = collapseDays(raw);
  const first = points[0] ?? null;
  const last = points[points.length - 1] ?? null;
  const prev = points[points.length - 2] ?? null;
  const rate = (a: WeightPoint | null, b: WeightPoint | null) =>
    a && b && b.at - a.at >= MIN_ADG_SPAN_MS ? round3((b.kg - a.kg) / ((b.at - a.at) / DAY_MS)) : null;
  return {
    key,
    label,
    points,
    firstAt: first?.at ?? null,
    lastAt: last?.at ?? null,
    firstKg: first?.kg ?? null,
    lastKg: last?.kg ?? null,
    gainKg: first && last && points.length > 1 ? round3(last.kg - first.kg) : null,
    days: first && last && points.length > 1 ? round3((last.at - first.at) / DAY_MS) : null,
    adgKg: rate(first, last),
    lastAdgKg: points.length > 2 ? rate(prev, last) : null,
  };
}

export interface WeighingEvent {
  capturedAt: number;
  kg: number;
  head: number;
  group: string | null;
  tag: string | null;
}

/**
 * Agrupa las pesadas: por lote de animales (texto libre `group`, sin distinguir mayúsculas) y por caravana.
 * Una pesada con caravana cuenta solo para el animal: si también contara en el lote, un animal pesado de más
 * distorsionaría el promedio del grupo.
 */
export function groupWeighings(events: readonly WeighingEvent[]): { groups: WeightSeries[]; animals: WeightSeries[] } {
  const groups = new Map<string, { label: string | null; pts: WeightPoint[] }>();
  const animals = new Map<string, WeightPoint[]>();
  // De la más vieja a la más nueva: el nombre del lote es como se escribió la primera vez.
  for (const e of [...events].sort((a, b) => a.capturedAt - b.capturedAt)) {
    const pt = { at: e.capturedAt, kg: e.kg, head: e.head };
    if (e.tag) {
      const l = animals.get(e.tag);
      if (l) l.push(pt);
      else animals.set(e.tag, [pt]);
      continue;
    }
    const key = (e.group ?? "").trim().toLowerCase();
    const g = groups.get(key);
    if (g) g.pts.push(pt);
    else groups.set(key, { label: e.group?.trim() || null, pts: [pt] });
  }
  const byLast = (a: WeightSeries, b: WeightSeries) => (b.lastAt ?? 0) - (a.lastAt ?? 0);
  return {
    groups: [...groups].map(([k, g]) => weightSeries(k, g.label, g.pts)).sort(byLast),
    animals: [...animals].map(([k, pts]) => weightSeries(k, k, pts)).sort(byLast),
  };
}

export interface WeighingsResponse {
  from: number;
  to: number;
  groups: WeightSeries[];
  animals: WeightSeries[];
  truncated: boolean;
}
