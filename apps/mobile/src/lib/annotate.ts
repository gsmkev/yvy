/**
 * Flujo "Anotar": una pregunta por pantalla, en el orden en que un recorredor trabaja.
 * Cada tipo de registro es una lista corta de pasos; los datos se arman al final y se validan con
 * el esquema compartido (packages/shared/src/records.ts), que es la única fuente de verdad.
 */
import { CROPS, DENSITY_UNITS, FERT_METHODS, HARVEST_DESTINATIONS, HEALTH_REASONS, HERD_CATEGORIES, MORTALITY_CAUSES, MOVE_REASONS, PESTS, PHENO_STAGES, type RecordKind } from "@yvy/shared";

/** Lo que el flujo necesita saber del campo para decidir qué preguntar. */
export interface FlowCtx {
  /** Aguadas y tajamares de la estancia (G-30): si no hay, no se pregunta cuál. */
  waterPois: number;
  /** Hay más de una campaña activa (A-01): si no, el paso de campaña no se pregunta. */
  askSeason?: boolean;
}

type StepBase = {
  /** Si devuelve true con las respuestas anteriores, el paso no se pregunta. */
  skipIf?: (answers: Record<string, unknown>, ctx: FlowCtx) => boolean;
};

export type Step = StepBase &
  (
  | { key: string; kind: "choice"; question: string; options: { value: string; label: string }[]; optional?: boolean }
  | { key: string; kind: "number"; question: string; hint?: string; unit: string; max: number; integer?: boolean; min?: number; optional?: boolean }
  | { key: string; kind: "yesno"; question: string }
  | { key: string; kind: "text"; question: string; optional?: boolean }
  /** Contador grande por categoría de hacienda (G-06): el valor es { vaca: 3, toro: 1, ... }. */
  | { key: string; kind: "counter"; question: string; hint?: string }
  /** Campaña: se elige entre las activas que bajaron al celular. */
  | { key: string; kind: "season"; question: string }
  /** Productos de la mezcla con su dosis (catálogo del celular, o a mano). Guarda ProductDose[]. */
  | { key: string; kind: "products"; question: string; fixedUnit?: "kg_ha"; productTypes?: string[] }
  /** Elegir un potrero de la estancia (excluye el de origen). La respuesta es su id. */
  | { key: string; kind: "paddock"; question: string }
  /** Elegir un punto de interés de un tipo (hoy: la aguada). La respuesta es su id; se guarda como poi_id. */
  | { key: string; kind: "poi"; question: string; poiKind: "water" }
  );

const lvl = (prefix: string) => ["low", "medium", "high"].map((v) => ({ value: v, label: `${prefix}${v}` }));
const cond = ["good", "fair", "bad"].map((v) => ({ value: v, label: `fields.condition_${v}` }));

/** Las etiquetas son claves de i18n; la pantalla las traduce. */
/** `track` no se carga con preguntas: lo graba la pantalla de recorrida (F-05). */
export const FLOWS: Record<RecordKind, Step[]> = {
  track: [],
  rain: [{ key: "mm", kind: "number", question: "app.rainQuestion", hint: "app.rainHint", unit: "mm", max: 1000 }],
  scouting: [
    { key: "condition", kind: "choice", question: "app.scoutQuestion", options: cond },
    { key: "note", kind: "text", question: "app.addNote", optional: true },
  ],
  pest: [
    { key: "pest", kind: "choice", question: "app.pestQuestion", options: PESTS.map((v) => ({ value: v, label: `fields.pest_${v}` })) },
    { key: "intensity", kind: "choice", question: "app.pestHowMuch", options: lvl("fields.level_") },
    { key: "note", kind: "text", question: "app.addNote", optional: true },
  ],
  crop_status: [
    { key: "stage", kind: "choice", question: "app.cropQuestion", options: PHENO_STAGES.map((v) => ({ value: v, label: `fields.stage_${v}` })) },
    { key: "condition", kind: "choice", question: "app.cropHow", options: cond },
    { key: "note", kind: "text", question: "app.addNote", optional: true },
  ],
  pasture_status: [
    { key: "heightCm", kind: "number", question: "app.pastureQuestion", unit: "cm", max: 500 },
    { key: "cover", kind: "choice", question: "app.pastureCover", options: lvl("fields.level_") },
    { key: "livestockPresent", kind: "yesno", question: "app.pastureLivestock" },
  ],
  water: [
    { key: "poiId", kind: "poi", question: "app.waterPoiQuestion", poiKind: "water", skipIf: (_a, ctx) => ctx.waterPois === 0 },
    {
      key: "level",
      kind: "choice",
      question: "app.waterQuestion",
      options: ["full", "half", "low", "dry"].map((v) => ({ value: v, label: `fields.water_${v}` })),
    },
    { key: "note", kind: "text", question: "app.addNote", optional: true },
  ],
  note: [{ key: "text", kind: "text", question: "app.noteQuestion" }],
  // ganaderia
  herd_count: [{ key: "counts", kind: "counter", question: "app.herdCountQuestion", hint: "app.herdCountHint" }],
  // En una venta no hay destino; en una compra el potrero elegido al empezar es el destino (ver annotate/index.tsx).
  herd_move: [
    {
      key: "reason",
      kind: "choice",
      question: "app.moveReasonQuestion",
      options: MOVE_REASONS.map((v) => ({ value: v, label: `fields.moveReason_${v}` })),
    },
    {
      key: "toPlotId",
      kind: "paddock",
      question: "app.moveToQuestion",
      skipIf: (a) => a.reason === "venta" || a.reason === "compra",
    },
    { key: "counts", kind: "counter", question: "app.moveCountQuestion", hint: "app.herdCountHint" },
  ],
  // La foto es el último paso común de todos los flujos.
  mortality: [
    {
      key: "category",
      kind: "choice",
      question: "app.mortalityCategoryQuestion",
      options: HERD_CATEGORIES.map((v) => ({ value: v, label: `fields.herd_${v}` })),
    },
    { key: "head", kind: "number", question: "app.mortalityHeadQuestion", unit: "cabezas", max: 1000, integer: true, min: 1 },
    {
      key: "cause",
      kind: "choice",
      question: "app.mortalityCauseQuestion",
      options: MORTALITY_CAUSES.map((v) => ({ value: v, label: `fields.cause_${v}` })),
    },
  ],
  health: [
    {
      key: "reason",
      kind: "choice",
      question: "app.healthReasonQuestion",
      options: HEALTH_REASONS.map((v) => ({ value: v, label: `fields.healthReason_${v}` })),
    },
    { key: "product", kind: "text", question: "app.healthProductQuestion" },
    { key: "dose", kind: "text", question: "app.healthDoseQuestion", optional: true },
    { key: "counts", kind: "counter", question: "app.healthCountQuestion", hint: "app.herdCountHint" },
    { key: "note", kind: "text", question: "app.addNote", optional: true },
  ],
  application: [
    { key: "seasonId", kind: "season", question: "app.seasonQuestion", skipIf: (_a, ctx) => !ctx.askSeason },
    { key: "products", kind: "products", question: "app.productsQuestion" },
    { key: "volumeLHa", kind: "number", question: "app.volumeQuestion", unit: "L/ha", max: 2000, optional: true },
    { key: "areaHa", kind: "number", question: "app.areaDoneQuestion", hint: "app.areaDoneHint", unit: "ha", max: 100_000, optional: true },
    { key: "windKmh", kind: "number", question: "app.windQuestion", hint: "app.windHint", unit: "km/h", max: 200, optional: true },
    { key: "tempC", kind: "number", question: "app.tempQuestion", unit: "°C", max: 60, optional: true },
    { key: "humidityPct", kind: "number", question: "app.humidityQuestion", hint: "app.humidityHint", unit: "%", max: 100, optional: true },
    { key: "note", kind: "text", question: "app.addNote", optional: true },
  ],
  fertilization: [
    { key: "seasonId", kind: "season", question: "app.seasonQuestion", skipIf: (_a, ctx) => !ctx.askSeason },
    { key: "products", kind: "products", question: "app.fertProductsQuestion", fixedUnit: "kg_ha", productTypes: ["fertilizer"] },
    { key: "method", kind: "choice", question: "app.fertMethodQuestion", options: FERT_METHODS.map((v) => ({ value: v, label: `fields.method_${v}` })) },
    { key: "areaHa", kind: "number", question: "app.areaDoneQuestion", hint: "app.areaDoneHint", unit: "ha", max: 100_000, optional: true },
    { key: "note", kind: "text", question: "app.addNote", optional: true },
  ],
  harvest: [
    { key: "seasonId", kind: "season", question: "app.seasonQuestion", skipIf: (_a, ctx) => !ctx.askSeason },
    { key: "tons", kind: "number", question: "app.tonsQuestion", hint: "app.tonsHint", unit: "t", max: 1_000_000 },
    { key: "moisturePct", kind: "number", question: "app.moistureQuestion", hint: "app.moistureHint", unit: "%", max: 100, optional: true },
    { key: "areaHa", kind: "number", question: "app.areaDoneQuestion", hint: "app.areaDoneHint", unit: "ha", max: 100_000, optional: true },
    {
      key: "destination",
      kind: "choice",
      question: "app.destinationQuestion",
      optional: true,
      options: HARVEST_DESTINATIONS.map((v) => ({ value: v, label: `fields.destination_${v}` })),
    },
    { key: "note", kind: "text", question: "app.addNote", optional: true },
  ],
  sowing: [
    { key: "seasonId", kind: "season", question: "app.seasonQuestion", skipIf: (_a, ctx) => !ctx.askSeason },
    { key: "crop", kind: "choice", question: "app.sowingCropQuestion", options: CROPS.map((v) => ({ value: v, label: `fields.crop_${v}` })) },
    { key: "variety", kind: "text", question: "app.varietyQuestion", optional: true },
    {
      key: "densityUnit",
      kind: "choice",
      question: "app.densityUnitQuestion",
      optional: true,
      options: DENSITY_UNITS.map((v) => ({ value: v, label: `fields.densityUnit_${v}` })),
    },
    { key: "density", kind: "number", question: "app.densityQuestion", unit: "", max: 1_000_000, skipIf: (a) => a.densityUnit === undefined },
    { key: "areaHa", kind: "number", question: "app.areaDoneQuestion", hint: "app.areaDoneHint", unit: "ha", max: 100_000, optional: true },
    { key: "note", kind: "text", question: "app.addNote", optional: true },
  ],
};

/** Pasos que se preguntan dado lo respondido hasta ahora. */
export const stepsFor = (kind: RecordKind | null, answers: Record<string, unknown>, ctx: FlowCtx = { waterPois: 0, askSeason: false }): Step[] =>
  kind ? FLOWS[kind].filter((s) => !s.skipIf?.(answers, ctx)) : [];

/** Pasos de una lista dada con lo contestado hasta ahora (campaña solo si hay más de una activa). */
export const visibleSteps = (steps: Step[], values: Record<string, unknown>, ctx: { askSeason: boolean }): Step[] =>
  steps.filter((s) => !s.skipIf?.(values, { waterPois: 0, askSeason: ctx.askSeason }));

/** Qué se puede anotar en cada tipo de lote, en el orden de frecuencia real. */
export const KINDS_FOR = (plotKind: "crop" | "pasture" | null): RecordKind[] =>
  plotKind === "pasture"
    ? ["pasture_status", "herd_count", "herd_move", "mortality", "health", "rain", "water", "pest", "scouting", "note"]
    : plotKind === "crop"
      ? ["scouting", "pest", "crop_status", "application", "fertilization", "sowing", "harvest", "rain", "water", "note"]
      : ["rain", "scouting", "water", "health", "note", "pest", "crop_status", "pasture_status", "application", "fertilization", "sowing", "harvest"];

/** Registros de hacienda: son de un solo potrero, no se cargan en varios a la vez (F-10). */
export const SINGLE_PLOT_KINDS: readonly RecordKind[] = ["herd_count", "herd_move", "mortality", "health"];
