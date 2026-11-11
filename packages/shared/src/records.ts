/**
 * Esquemas de los 7 tipos de registro (PRD RF-30). Única definición: app, web y Worker importan esto.
 * Subir RECORD_SCHEMA_VERSION al cambiar un esquema de forma incompatible.
 */
import { z } from "zod";
import { HERD_CATEGORIES, MAX_HEAD_PER_CATEGORY, MOVE_REASONS } from "./livestock";
import type { RecordKind } from "./schema";
import { LIMITS } from "./limits";

export const RECORD_SCHEMA_VERSION = 1;

const note = z.string().trim().max(2000).optional();
const condition = z.enum(["good", "fair", "bad"]);
const level3 = z.enum(["low", "medium", "high"]);

export const PESTS = ["chinche", "oruga", "roya", "malezas", "otra"] as const;
export const PHENO_STAGES = [
  "siembra",
  "emergencia",
  "vegetativo",
  "floracion",
  "llenado",
  "madurez",
  "cosecha",
] as const;

/** Estación de un monitoreo (F-12): dónde se paró y cuánto contó de cada plaga de la plantilla del cultivo. */
export const stationSchema = z.object({
  lon: z.number().min(-180).max(180).optional(),
  lat: z.number().min(-90).max(90).optional(),
  accuracyM: z.number().nonnegative().max(100_000).optional(),
  counts: z.record(z.string().max(40), z.number().nonnegative().max(LIMITS.monitoring.maxCount)),
});
export type Station = z.infer<typeof stationSchema>;
// ---------- ganaderia (ADR 0004) ----------
const headCount = z.number().int().min(0).max(MAX_HEAD_PER_CATEGORY);
/** Cabezas por categoría; al menos una categoría con dato (un 0 es un dato: "conté y no hay"). */
export const herdCountsSchema = z
  .object({
    vaca: headCount.optional(),
    vaquilla: headCount.optional(),
    novillo: headCount.optional(),
    ternero: headCount.optional(),
    toro: headCount.optional(),
  })
  .refine((c) => HERD_CATEGORIES.some((k) => c[k] !== undefined), { message: "Cargá al menos una categoría" });

const livestockSchemas = {
  /** El potrero es records.plot_id. */
  herd_count: z.object({ counts: herdCountsSchema, note }),
  /** Origen = records.plot_id (vacío si entra de afuera); destino = toPlotId (vacío si sale del campo). */
  herd_move: z
    .object({
      toPlotId: z.uuid().optional(),
      counts: herdCountsSchema,
      reason: z.enum(MOVE_REASONS),
      note,
    })
    .refine((d) => d.reason === "otro" || (d.reason === "venta") === (d.toPlotId === undefined), {
      message: "Indicá el potrero de destino (salvo en una venta)",
    }),
};
// ---------- fin ganaderia ----------

export const recordDataSchemas = {
  scouting: z.object({ condition, note }),
  pest: z
    .object({
      pest: z.enum(PESTS),
      intensity: level3.optional(),
      perMeter: z.number().nonnegative().max(10_000).optional(),
      /** Monitoreo por estaciones (F-12). Campos opcionales: los registros viejos siguen siendo válidos. */
      crop: z.string().max(20).optional(),
      stations: z.array(stationSchema).min(1).max(LIMITS.monitoring.maxStations).optional(),
      averages: z.record(z.string().max(40), z.number().nonnegative().max(LIMITS.monitoring.maxCount)).optional(),
      note,
    })
    .refine((d) => d.intensity !== undefined || d.perMeter !== undefined || d.stations !== undefined, {
      message: "Indicá intensidad o número por metro",
    }),
  crop_status: z.object({ stage: z.enum(PHENO_STAGES), condition, note }),
  pasture_status: z.object({
    heightCm: z.number().nonnegative().max(500),
    cover: level3,
    livestockPresent: z.boolean(),
    note,
  }),
  rain: z.object({
    mm: z.number().nonnegative().max(1000),
    /** Hora de lectura (epoch ms). El pluviómetro va en records.poi_id. */
    readAt: z.number().int().nonnegative(),
  }),
  water: z.object({ level: z.enum(["full", "half", "low", "dry"]), note }),
  note: z.object({ text: z.string().trim().min(1).max(4000) }),
  ...livestockSchemas,
} satisfies Record<RecordKind, z.ZodType>;

export type RecordData<K extends RecordKind> = z.infer<(typeof recordDataSchemas)[K]>;

export const parseRecordData = (kind: RecordKind, data: unknown) => recordDataSchemas[kind].safeParse(data);
