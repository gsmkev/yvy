/**
 * Campos de cada tipo de registro (RF-30), en el mismo orden y con los mismos valores que los esquemas Zod
 * de packages/shared/src/records.ts. La validación final la hace parseRecordData.
 */
import { HERD_CATEGORIES, MORTALITY_CAUSES, MOVE_REASONS, PESTS, PHENO_STAGES, type RecordKind } from "@yvy/shared";

export type FieldSpec =
  | { key: string; type: "choice"; options: readonly string[]; labelPrefix: string; required?: boolean }
  | { key: string; type: "number"; unit?: string; required?: boolean }
  | { key: string; type: "boolean"; required?: boolean }
  | { key: string; type: "text"; multiline?: boolean; required?: boolean }
  | { key: string; type: "poi" }
  | { key: string; type: "counts"; required?: boolean };

const condition: FieldSpec = {
  key: "condition",
  type: "choice",
  options: ["good", "fair", "bad"],
  labelPrefix: "fields.condition_",
  required: true,
};
const level3 = (key: string): FieldSpec => ({
  key,
  type: "choice",
  options: ["low", "medium", "high"],
  labelPrefix: "fields.level_",
});
const note: FieldSpec = { key: "note", type: "text", multiline: true };

export const FORMS: Record<RecordKind, FieldSpec[]> = {
  scouting: [condition, note],
  pest: [
    { key: "pest", type: "choice", options: PESTS, labelPrefix: "fields.pest_", required: true },
    level3("intensity"),
    { key: "perMeter", type: "number" },
    note,
  ],
  crop_status: [
    { key: "stage", type: "choice", options: PHENO_STAGES, labelPrefix: "fields.stage_", required: true },
    condition,
    note,
  ],
  pasture_status: [
    { key: "heightCm", type: "number", unit: "cm", required: true },
    { ...level3("cover"), required: true } as FieldSpec,
    { key: "livestockPresent", type: "boolean", required: true },
    note,
  ],
  rain: [
    { key: "mm", type: "number", unit: "mm", required: true },
    { key: "gauge", type: "poi" },
  ],
  water: [
    {
      key: "level",
      type: "choice",
      options: ["full", "half", "low", "dry"],
      labelPrefix: "fields.water_",
      required: true,
    },
    note,
  ],
  note: [{ key: "text", type: "text", multiline: true, required: true }],
  // ganaderia
  herd_count: [{ key: "counts", type: "counts", required: true }, note],
  herd_move: [
    { key: "reason", type: "choice", options: MOVE_REASONS, labelPrefix: "fields.moveReason_", required: true },
    { key: "toPlotId", type: "poi" },
    { key: "counts", type: "counts", required: true },
    note,
  ],
  mortality: [
    { key: "category", type: "choice", options: HERD_CATEGORIES, labelPrefix: "fields.herd_", required: true },
    { key: "head", type: "number", unit: "cabezas", required: true },
    { key: "cause", type: "choice", options: MORTALITY_CAUSES, labelPrefix: "fields.cause_", required: true },
    note,
  ],
};
