/**
 * Flujo "Anotar": una pregunta por pantalla, en el orden en que un recorredor trabaja.
 * Cada tipo de registro es una lista corta de pasos; los datos se arman al final y se validan con
 * el esquema compartido (packages/shared/src/records.ts), que es la única fuente de verdad.
 */
import { HERD_CATEGORIES, MORTALITY_CAUSES, MOVE_REASONS, PESTS, PHENO_STAGES, type RecordKind } from "@yvy/shared";

type StepBase = {
  /** Si devuelve true con las respuestas anteriores, el paso no se pregunta. */
  skipIf?: (answers: Record<string, unknown>) => boolean;
};

export type Step = StepBase &
  (
  | { key: string; kind: "choice"; question: string; options: { value: string; label: string }[]; optional?: boolean }
  | { key: string; kind: "number"; question: string; hint?: string; unit: string; max: number; integer?: boolean; min?: number }
  | { key: string; kind: "yesno"; question: string }
  | { key: string; kind: "text"; question: string; optional?: boolean }
  /** Contador grande por categoría de hacienda (G-06): el valor es { vaca: 3, toro: 1, ... }. */
  | { key: string; kind: "counter"; question: string; hint?: string }
  /** Elegir un potrero de la estancia (excluye el de origen). La respuesta es su id. */
  | { key: string; kind: "paddock"; question: string }
  );

const lvl = (prefix: string) => ["low", "medium", "high"].map((v) => ({ value: v, label: `${prefix}${v}` }));
const cond = ["good", "fair", "bad"].map((v) => ({ value: v, label: `fields.condition_${v}` }));

/** Las etiquetas son claves de i18n; la pantalla las traduce. */
export const FLOWS: Record<RecordKind, Step[]> = {
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
};

/** Pasos que se preguntan dado lo respondido hasta ahora. */
export const stepsFor = (kind: RecordKind | null, answers: Record<string, unknown>): Step[] =>
  kind ? FLOWS[kind].filter((s) => !s.skipIf?.(answers)) : [];

/** Qué se puede anotar en cada tipo de lote, en el orden de frecuencia real. */
export const KINDS_FOR = (plotKind: "crop" | "pasture" | null): RecordKind[] =>
  plotKind === "pasture"
    ? ["pasture_status", "herd_count", "herd_move", "mortality", "rain", "water", "pest", "scouting", "note"]
    : plotKind === "crop"
      ? ["scouting", "pest", "crop_status", "rain", "water", "note"]
      : ["rain", "scouting", "water", "note", "pest", "crop_status", "pasture_status"];

/** Registros de hacienda: son de un solo potrero, no se cargan en varios a la vez (F-10). */
export const SINGLE_PLOT_KINDS: readonly RecordKind[] = ["herd_count", "herd_move", "mortality"];
