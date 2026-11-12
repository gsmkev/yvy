/**
 * Campos de cada tipo de registro (RF-30), en el mismo orden y con los mismos valores que los esquemas Zod
 * de packages/shared/src/records.ts. La validación final la hace parseRecordData.
 */
import { IRRIGATION_METHODS, REPRO_EVENTS, SERVICE_METHODS, SUPPLEMENT_TYPES, CROPS, DENSITY_UNITS, FERT_METHODS, HARVEST_DESTINATIONS, HEALTH_REASONS, HERD_CATEGORIES, MORTALITY_CAUSES, MOVE_REASONS, PESTS, PHENO_STAGES, type RecordKind } from "@yvy/shared";

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
  track: [],
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
  theft: [
    { key: "category", type: "choice", options: HERD_CATEGORIES, labelPrefix: "fields.herd_", required: true },
    { key: "head", type: "number", unit: "cabezas", required: true },
    { key: "policeReport", type: "text" },
    note,
  ],
  reproduction: [
    { key: "event", type: "choice", options: REPRO_EVENTS, labelPrefix: "fields.reproEvent_", required: true },
    { key: "head", type: "number" },
    { key: "method", type: "choice", options: SERVICE_METHODS, labelPrefix: "fields.reproMethod_" },
    { key: "pregnant", type: "number" },
    { key: "calves", type: "number" },
    { key: "tag", type: "text" },
    note,
  ],
  weighing: [
    { key: "kg", type: "number", unit: "kg", required: true },
    { key: "tag", type: "text" },
    { key: "group", type: "text" },
    { key: "head", type: "number", unit: "cabezas" },
    note,
  ],
  supplement: [
    { key: "type", type: "choice", options: SUPPLEMENT_TYPES, labelPrefix: "fields.supplementType_", required: true },
    { key: "kg", type: "number", unit: "kg", required: true },
    { key: "product", type: "text" },
    note,
  ],
  health: [
    { key: "reason", type: "choice", options: HEALTH_REASONS, labelPrefix: "fields.healthReason_", required: true },
    { key: "product", type: "text", required: true },
    { key: "dose", type: "text" },
    { key: "counts", type: "counts", required: true },
    { key: "tag", type: "text" },
    note,
  ],
  irrigation: [
    { key: "mm", type: "number", unit: "mm", required: true },
    { key: "method", type: "choice", options: IRRIGATION_METHODS, labelPrefix: "fields.irrigationMethod_", required: true },
    note,
  ],
  fuel_load: [
    { key: "machine", type: "text", required: true },
    { key: "liters", type: "number", unit: "l", required: true },
    { key: "meterValue", type: "number" },
    note,
  ],
  stock_count: [],
  harvest: [
    { key: "tons", type: "number", unit: "t", required: true },
    { key: "moisturePct", type: "number", unit: "%" },
    { key: "areaHa", type: "number", unit: "ha" },
    { key: "destination", type: "choice", options: HARVEST_DESTINATIONS, labelPrefix: "fields.destination_" },
    note,
  ],
  fertilization: [
    { key: "method", type: "choice", options: FERT_METHODS, labelPrefix: "fields.method_", required: true },
    { key: "areaHa", type: "number", unit: "ha" },
    note,
  ],
  application: [
    { key: "volumeLHa", type: "number", unit: "L/ha" },
    { key: "areaHa", type: "number", unit: "ha" },
    { key: "windKmh", type: "number", unit: "km/h" },
    { key: "tempC", type: "number", unit: "°C" },
    { key: "humidityPct", type: "number", unit: "%" },
    { key: "machine", type: "text" },
    note,
  ],
  sowing: [
    { key: "crop", type: "choice", options: CROPS, labelPrefix: "fields.crop_", required: true },
    { key: "variety", type: "text" },
    { key: "density", type: "number" },
    { key: "densityUnit", type: "choice", options: DENSITY_UNITS, labelPrefix: "fields.densityUnit_" },
    { key: "areaHa", type: "number", unit: "ha" },
    note,
  ],
};
