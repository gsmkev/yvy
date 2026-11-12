/**
 * Plan de siembra de la campaña (A-03): superficie por cultivo y variedad y semilla necesaria.
 * Función pura: corre igual en la web, el celular y el Worker.
 */
import type { CROPS } from "./schema";

type Crop = (typeof CROPS)[number];

/** Densidad de semilla de referencia en kg por hectárea; la web la deja editar por fila. A revisar por un agrónomo. */
export const SEED_RATE_KG_HA: Record<Crop, number> = {
  soja: 60,
  maiz: 20,
  trigo: 110,
  arroz: 100,
  girasol: 5,
  chia: 6,
  otro: 0,
};

export interface SowingPlanRow {
  crop: Crop;
  /** null = sin variedad definida. */
  variety: string | null;
  plots: number;
  areaHa: number;
  /** kg de semilla con la densidad de referencia del cultivo (o la que se pase en `rates`). */
  seedKg: number;
}

export interface SowingPlanResult {
  rows: SowingPlanRow[];
  plannedHa: number;
  /** Lotes de cultivo sin cultivo definido en la campaña, y su superficie. */
  unplannedPlots: number;
  unplannedHa: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Agrupa por cultivo y variedad los lotes de cultivo de la campaña. Un lote sin plan (o sin cultivo) cuenta
 * como "sin planificar". `rates` pisa la densidad de referencia por cultivo (kg/ha).
 */
export function sowingPlan(
  plots: { id: string; kind: "crop" | "pasture"; areaHa: number }[],
  plotSeasons: { plotId: string; seasonId: string; crop: Crop | null; variety: string | null }[],
  seasonId: string,
  rates: Partial<Record<Crop, number>> = {},
): SowingPlanResult {
  const plan = new Map(plotSeasons.filter((p) => p.seasonId === seasonId).map((p) => [p.plotId, p]));
  const groups = new Map<string, SowingPlanRow>();
  let unplannedPlots = 0;
  let unplannedHa = 0;
  for (const p of plots) {
    if (p.kind !== "crop") continue;
    const ps = plan.get(p.id);
    if (!ps?.crop) {
      unplannedPlots++;
      unplannedHa += p.areaHa;
      continue;
    }
    const variety = ps.variety?.trim() || null;
    const key = `${ps.crop}\u0000${(variety ?? "").toLowerCase()}`;
    const row = groups.get(key) ?? { crop: ps.crop, variety, plots: 0, areaHa: 0, seedKg: 0 };
    row.plots++;
    row.areaHa += p.areaHa;
    groups.set(key, row);
  }
  const rows = [...groups.values()]
    .map((r) => ({
      ...r,
      areaHa: r1(r.areaHa),
      seedKg: Math.round(r.areaHa * (rates[r.crop] ?? SEED_RATE_KG_HA[r.crop])),
    }))
    .sort(
      (a, b) =>
        b.areaHa - a.areaHa || a.crop.localeCompare(b.crop) || (a.variety ?? "").localeCompare(b.variety ?? ""),
    );
  return {
    rows,
    plannedHa: r1(rows.reduce((a, r) => a + r.areaHa, 0)),
    unplannedPlots,
    unplannedHa: r1(unplannedHa),
  };
}
