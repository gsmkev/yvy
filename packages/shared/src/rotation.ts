/**
 * Rotación de potreros (G-04) y oferta de forraje (G-05). Lógica pura compartida por el Worker y la web.
 * Todos los coeficientes son VALORES POR DEFECTO A REVISAR POR UN TÉCNICO: referencias generales de pasturas
 * tropicales (Brachiaria, Panicum) en cría y engorde extensivos, no una recomendación para un campo en particular.
 */
import { HERD_CATEGORIES, emptyCounts, totalHead, type HerdCategory, type HerdCounts } from "./livestock";

const DAY = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------- Rotación (G-04) ----------

export const ROTATION_DEFAULTS = {
  /** Días de descanso mínimos antes de volver a entrar a un potrero. */
  minRestDays: 35,
  /** Días de ocupación a partir de los cuales conviene mover la hacienda. */
  maxOccupancyDays: 14,
  /** Altura mínima del pasto (cm) para entrar. */
  minEntryHeightCm: 20,
  /** Una medición de pasto más vieja que esto no cuenta para sugerir. */
  statusMaxAgeDays: 45,
} as const;

/** Evento de hacienda para reconstruir cuándo estuvo ocupado cada potrero. */
export type HerdEvent =
  | { at: number; type: "count"; plotId: string; counts: HerdCounts }
  | { at: number; type: "move"; fromPlotId: string | null; toPlotId: string | null; counts: HerdCounts }
  | { at: number; type: "loss"; plotId: string; category: HerdCategory; head: number };

export interface PaddockTimeline {
  plotId: string;
  /** ¿Tiene hacienda hoy? */
  occupied: boolean;
  head: number;
  /** Desde cuándo está ocupado (la entrada de la estadía actual), o null. */
  occupiedSince: number | null;
  /** Desde cuándo está vacío (salida de la última estadía), o null si está ocupado o nunca se usó en el período. */
  emptySince: number | null;
  /** Días de la estadía actual, o de la última si está vacío; null si nunca se ocupó. */
  stayDays: number | null;
  /** Días de descanso hasta hoy; null si está ocupado o no hay salida registrada. */
  restDays: number | null;
  /** Días ocupados en total dentro del período reconstruido. */
  occupiedDays: number;
}

/**
 * Reconstruye la ocupación de cada potrero repasando los eventos en orden: un conteo fija la hacienda del potrero,
 * un movimiento la pasa de un potrero a otro y la mortandad o el abigeato la descuentan. "Ocupado" es tener al menos
 * una cabeza. Solo se conoce lo que ocurrió dentro de los eventos recibidos: un potrero sin eventos queda sin datos.
 */
export function paddockTimelines(
  plotIds: readonly string[],
  events: readonly HerdEvent[],
  now: number,
): Map<string, PaddockTimeline> {
  const state = new Map<
    string,
    { counts: Record<HerdCategory, number>; since: number | null; emptySince: number | null; lastStay: number | null; occupiedMs: number }
  >();
  for (const id of plotIds)
    state.set(id, { counts: emptyCounts(), since: null, emptySince: null, lastStay: null, occupiedMs: 0 });
  const touch = (id: string | null, at: number) => {
    const st = id ? state.get(id) : undefined;
    if (!st) return;
    const occ = totalHead(st.counts) > 0;
    if (occ && st.since === null) {
      st.since = at;
      st.emptySince = null;
    } else if (!occ && st.since !== null) {
      st.occupiedMs += at - st.since;
      st.lastStay = at - st.since;
      st.since = null;
      st.emptySince = at;
    }
  };
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    if (e.type === "count") {
      const st = state.get(e.plotId);
      if (!st) continue;
      for (const k of HERD_CATEGORIES) st.counts[k] = e.counts[k] ?? 0;
      touch(e.plotId, e.at);
    } else if (e.type === "move") {
      const from = e.fromPlotId ? state.get(e.fromPlotId) : undefined;
      const to = e.toPlotId ? state.get(e.toPlotId) : undefined;
      for (const k of HERD_CATEGORIES) {
        if (from) from.counts[k] = Math.max(0, from.counts[k] - (e.counts[k] ?? 0));
        if (to) to.counts[k] += e.counts[k] ?? 0;
      }
      touch(e.fromPlotId, e.at);
      touch(e.toPlotId, e.at);
    } else {
      const st = state.get(e.plotId);
      if (!st) continue;
      st.counts[e.category] = Math.max(0, st.counts[e.category] - e.head);
      touch(e.plotId, e.at);
    }
  }
  const out = new Map<string, PaddockTimeline>();
  for (const [plotId, st] of state) {
    const occupied = st.since !== null;
    out.set(plotId, {
      plotId,
      occupied,
      head: totalHead(st.counts),
      occupiedSince: st.since,
      emptySince: st.emptySince,
      stayDays: occupied ? round1((now - st.since!) / DAY) : st.lastStay !== null ? round1(st.lastStay / DAY) : null,
      restDays: st.emptySince !== null ? round1((now - st.emptySince) / DAY) : null,
      occupiedDays: round1((st.occupiedMs + (occupied ? now - st.since! : 0)) / DAY),
    });
  }
  return out;
}

export type PastureCover = "low" | "medium" | "high";
export interface PastureReading {
  heightCm: number;
  cover: PastureCover;
  at: number;
}

export type PaddockState = "occupied" | "overdue" | "ready" | "resting" | "unknown";

export interface RotationRow extends PaddockTimeline {
  name: string;
  areaHa: number;
  pasture: PastureReading | null;
  state: PaddockState;
  /** Para un potrero libre: ¿el pasto medido está para entrar? null si no hay medición reciente. */
  pastureReady: boolean | null;
}

export interface RotationResponse {
  defaults: typeof ROTATION_DEFAULTS;
  plots: RotationRow[];
  /** Potrero sugerido para la próxima entrada y por qué; null si ninguno está listo. */
  suggested: { plotId: string; name: string; restDays: number | null; pastureReady: boolean | null } | null;
  truncated: boolean;
}

/**
 * Estado de cada potrero y próximo potrero sugerido. Candidato = sin hacienda con descanso cumplido (o sin historial
 * de uso). Se prefiere el que tiene pasto medido listo (altura mínima y cobertura no baja), después el que no tiene
 * medición, y entre iguales el de más días de descanso. Un potrero con pasto medido bajo no se sugiere.
 */
export function rotationPlan(
  plots: readonly { plotId: string; name: string; areaHa: number }[],
  timelines: ReadonlyMap<string, PaddockTimeline>,
  pastures: ReadonlyMap<string, PastureReading>,
  now: number,
  cfg: typeof ROTATION_DEFAULTS = ROTATION_DEFAULTS,
): Pick<RotationResponse, "plots" | "suggested"> {
  const rows: RotationRow[] = plots.map((p) => {
    const tl = timelines.get(p.plotId)!;
    const reading = pastures.get(p.plotId) ?? null;
    const fresh = reading && now - reading.at <= cfg.statusMaxAgeDays * DAY ? reading : null;
    const pastureReady = fresh ? fresh.heightCm >= cfg.minEntryHeightCm && fresh.cover !== "low" : null;
    let state: PaddockState;
    if (tl.occupied) state = (tl.stayDays ?? 0) > cfg.maxOccupancyDays ? "overdue" : "occupied";
    else if (tl.restDays === null) state = "unknown";
    else state = tl.restDays >= cfg.minRestDays ? "ready" : "resting";
    return { ...tl, name: p.name, areaHa: p.areaHa, pasture: reading, state, pastureReady };
  });
  const rank = (r: RotationRow) => (r.pastureReady === true ? 0 : r.pastureReady === null ? 1 : 2);
  const candidates = rows
    .filter((r) => (r.state === "ready" || r.state === "unknown") && r.pastureReady !== false)
    .sort((a, b) => rank(a) - rank(b) || (b.restDays ?? -1) - (a.restDays ?? -1) || a.name.localeCompare(b.name));
  const top = candidates[0];
  return {
    plots: rows,
    suggested: top ? { plotId: top.plotId, name: top.name, restDays: top.restDays, pastureReady: top.pastureReady } : null,
  };
}

// ---------- Oferta de forraje (G-05) ----------

export const FORAGE = {
  /** kg de materia seca por hectárea y por cm de altura, según la cobertura medida. */
  kgDmPerHaPerCm: { low: 80, medium: 120, high: 160 } as Record<PastureCover, number>,
  /** NDVI → kg MS/ha: max(0, NDVI - base) * slope. */
  ndviBase: 0.2,
  ndviSlopeKgDmHa: 8000,
  /**
   * Calibración con la altura medida: si hay una imagen de satélite de la fecha de la medición (a no más de
   * `calibrationWindowDays` días), la altura fija el nivel y el NDVI solo mueve la estimación desde entonces:
   * kg MS/ha = kg de la altura x (kg por NDVI hoy / kg por NDVI el día de la medición), con la razón entre
   * `ratioMin` y `ratioMax` para que una imagen mala no dispare el número.
   */
  calibrationWindowDays: 7,
  ratioMin: 0.3,
  ratioMax: 3,
  /** Peso de cada método cuando hay los dos pero no hay imagen de la fecha de la medición: la altura pesa más. */
  heightWeight: 0.6,
  /** Fracción del forraje que se puede cosechar sin dañar el pasto ("tomar la mitad, dejar la mitad"). */
  utilization: 0.5,
  /** Consumo de materia seca de una UA (400 kg) por día: 2,5 % del peso vivo. */
  dmPerUaDay: 10,
  /** Una medición o imagen más vieja que esto se marca como vieja. */
  staleDays: 30,
} as const;

export type ForageMethod = "height" | "ndvi" | "both" | "calibrated";

export interface ForageInput {
  heightCm: number | null;
  cover: PastureCover | null;
  heightAt: number | null;
  ndvi: number | null;
  ndviAt: number | null;
  /** NDVI de la imagen más cercana a la fecha de la altura medida (a no más de calibrationWindowDays); null si no hay. */
  ndviAtHeight?: number | null;
  areaHa: number;
  /** Unidades animales presentes hoy. */
  ua: number;
  now: number;
}

export interface ForageEstimate {
  method: ForageMethod | null;
  kgDmHa: number | null;
  totalKgDm: number | null;
  /** Lo que se puede comer: total × aprovechamiento. */
  usableKgDm: number | null;
  demandKgDay: number;
  /** Días que alcanza el pasto con la hacienda actual; null si no hay hacienda o no hay estimación. */
  daysLeft: number | null;
  heightKgDmHa: number | null;
  ndviKgDmHa: number | null;
  stale: boolean;
}

export const kgDmFromHeight = (heightCm: number, cover: PastureCover): number =>
  Math.round(heightCm * FORAGE.kgDmPerHaPerCm[cover]);
export const kgDmFromNdvi = (ndvi: number): number =>
  Math.round(Math.max(0, ndvi - FORAGE.ndviBase) * FORAGE.ndviSlopeKgDmHa);

export function estimateForage(i: ForageInput): ForageEstimate {
  const heightKg = i.heightCm !== null && i.cover !== null ? kgDmFromHeight(i.heightCm, i.cover) : null;
  const ndviKg = i.ndvi !== null ? kgDmFromNdvi(i.ndvi) : null;
  const anchorKg = i.ndviAtHeight != null ? kgDmFromNdvi(i.ndviAtHeight) : 0;
  const calibrated = heightKg !== null && ndviKg !== null && anchorKg > 0;
  const kgHa = calibrated
    ? Math.round(heightKg * Math.min(FORAGE.ratioMax, Math.max(FORAGE.ratioMin, ndviKg / anchorKg)))
    : heightKg !== null && ndviKg !== null
      ? Math.round(FORAGE.heightWeight * heightKg + (1 - FORAGE.heightWeight) * ndviKg)
      : (heightKg ?? ndviKg);
  const method: ForageMethod | null = calibrated
    ? "calibrated"
    : heightKg !== null && ndviKg !== null
      ? "both"
      : heightKg !== null
        ? "height"
        : ndviKg !== null
          ? "ndvi"
          : null;
  const total = kgHa === null ? null : Math.round(kgHa * i.areaHa);
  const usable = total === null ? null : Math.round(total * FORAGE.utilization);
  const demand = Math.round(i.ua * FORAGE.dmPerUaDay);
  const old = (at: number | null) => at !== null && i.now - at > FORAGE.staleDays * DAY;
  const used = [heightKg !== null ? i.heightAt : null, ndviKg !== null ? i.ndviAt : null].filter((x): x is number => x !== null);
  return {
    method,
    kgDmHa: kgHa,
    totalKgDm: total,
    usableKgDm: usable,
    demandKgDay: demand,
    daysLeft: usable !== null && demand > 0 ? Math.floor(usable / demand) : null,
    heightKgDmHa: heightKg,
    ndviKgDmHa: ndviKg,
    stale: used.length > 0 && used.every(old),
  };
}

export interface ForageRow extends ForageEstimate {
  plotId: string;
  name: string;
  areaHa: number;
  head: number;
  ua: number;
  heightCm: number | null;
  cover: PastureCover | null;
  heightAt: number | null;
  ndvi: number | null;
  ndviAt: number | null;
}

export interface ForageResponse {
  plots: ForageRow[];
  coefficients: typeof FORAGE;
}
