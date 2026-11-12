/** Datos del informe de daños para el seguro agrícola (C-09): vigor antes y después del evento y registros de alrededor. */
import { addDays } from "@yvy/shared";
import { toIso } from "./format";
import type { RecordRow } from "./types";

export const DAMAGE_CAUSES = ["frost", "drought", "hail", "excess_rain", "fire", "pest", "wind", "other"] as const;
export type DamageCause = (typeof DAMAGE_CAUSES)[number];

export interface NdviPass {
  acquiredAt: number;
  mean: number;
  validPct: number;
}

export interface DamageSatellite {
  /** Última pasada con 60 % o más de píxeles válidos hasta el día del evento. */
  before: NdviPass | null;
  /** Primera pasada válida desde el día siguiente al evento. */
  after: NdviPass | null;
  /** Cambio del NDVI medio entre antes y después, en %; null si falta alguna. */
  changePct: number | null;
  /** Pasadas desde 60 días antes hasta 60 días después, para el gráfico. */
  series: NdviPass[];
}

const DAY = 86_400_000;
export const MIN_VALID_PCT = 60;

/** Fin del día del evento en milisegundos (hora de Paraguay, UTC-3). */
export const endOfEventDay = (isoDay: string) => Date.parse(`${isoDay}T23:59:59-03:00`);

export function damageSatellite(series: NdviPass[], eventDay: string): DamageSatellite {
  const end = endOfEventDay(eventDay);
  const valid = series.filter((p) => p.validPct >= MIN_VALID_PCT).sort((a, b) => a.acquiredAt - b.acquiredAt);
  const before = [...valid].reverse().find((p) => p.acquiredAt <= end) ?? null;
  const after = valid.find((p) => p.acquiredAt > end) ?? null;
  return {
    before,
    after,
    changePct: before && after && before.mean > 0 ? Math.round(((after.mean - before.mean) / before.mean) * 1000) / 10 : null,
    series: valid.filter((p) => p.acquiredAt >= end - 60 * DAY && p.acquiredAt <= end + 60 * DAY),
  };
}

/** Rango de fechas de los registros que se piden: 14 días antes y 45 después del evento. */
export const recordsRange = (eventDay: string) => ({
  from: Date.parse(`${addDays(eventDay, -14)}T00:00:00-03:00`),
  to: Date.parse(`${addDays(eventDay, 45)}T23:59:59-03:00`),
});

export interface DamageEvidence {
  records: RecordRow[];
  /** Registros con foto ya subida, los más cercanos al evento primero (con tope). */
  withPhotos: RecordRow[];
}

/** Ordena los registros por fecha y separa los que tienen fotos subidas, los más cercanos al evento primero. */
export function damageEvidence(rows: RecordRow[], eventDay: string, maxPhotos = 9): DamageEvidence {
  const ref = endOfEventDay(eventDay) - DAY / 2;
  const records = [...rows].sort((a, b) => a.capturedAt - b.capturedAt);
  const withPhotos = records
    .filter((r) => r.attachments.some((a) => a.uploadStatus === "uploaded"))
    .sort((a, b) => Math.abs(a.capturedAt - ref) - Math.abs(b.capturedAt - ref))
    .slice(0, maxPhotos);
  return { records, withPhotos };
}

export const todayIso = () => toIso(Date.now());
