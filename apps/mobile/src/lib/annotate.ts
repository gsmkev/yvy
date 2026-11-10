/**
 * Flujo "Anotar": una pregunta por pantalla, en el orden en que un recorredor trabaja.
 * Cada tipo de registro es una lista corta de pasos; los datos se arman al final y se validan con
 * el esquema compartido (packages/shared/src/records.ts), que es la única fuente de verdad.
 */
import { PESTS, PHENO_STAGES, type RecordKind } from "@yvy/shared";

export type Step =
  | { key: string; kind: "choice"; question: string; options: { value: string; label: string }[]; optional?: boolean }
  | { key: string; kind: "number"; question: string; hint?: string; unit: string; max: number }
  | { key: string; kind: "yesno"; question: string }
  | { key: string; kind: "text"; question: string; optional?: boolean };

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
};

/** Qué se puede anotar en cada tipo de lote, en el orden de frecuencia real. */
export const KINDS_FOR = (plotKind: "crop" | "pasture" | null): RecordKind[] =>
  plotKind === "pasture"
    ? ["pasture_status", "rain", "water", "pest", "scouting", "note"]
    : plotKind === "crop"
      ? ["scouting", "pest", "crop_status", "rain", "water", "note"]
      : ["rain", "scouting", "water", "note", "pest", "crop_status", "pasture_status"];
