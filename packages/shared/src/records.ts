/**
 * Esquemas de los 7 tipos de registro (PRD RF-30). Única definición: app, web y Worker importan esto.
 * Subir RECORD_SCHEMA_VERSION al cambiar un esquema de forma incompatible.
 */
import { z } from "zod";
import type { RecordKind } from "./schema";

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

export const recordDataSchemas = {
  scouting: z.object({ condition, note }),
  pest: z
    .object({
      pest: z.enum(PESTS),
      intensity: level3.optional(),
      perMeter: z.number().nonnegative().max(10_000).optional(),
      note,
    })
    .refine((d) => d.intensity !== undefined || d.perMeter !== undefined, {
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
} satisfies Record<RecordKind, z.ZodType>;

export type RecordData<K extends RecordKind> = z.infer<(typeof recordDataSchemas)[K]>;

export const parseRecordData = (kind: RecordKind, data: unknown) => recordDataSchemas[kind].safeParse(data);
