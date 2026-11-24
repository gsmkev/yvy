/**
 * Flujo "Anotar": una pregunta por pantalla, en el orden en que un recorredor trabaja.
 * Cada tipo de registro es una lista corta de pasos; los datos se arman al final y se validan con
 * el esquema compartido (packages/shared/src/records.ts), que es la única fuente de verdad.
 */
import { LIMITS, IRRIGATION_METHODS, EXTRA_PREFIX, type FormField, REPRO_EVENTS, SERVICE_METHODS, ANIMAL_TAG_RE, SUPPLEMENT_TYPES, CROPS, DENSITY_UNITS, FERT_METHODS, HARVEST_DESTINATIONS, HEALTH_REASONS, HERD_CATEGORIES, MORTALITY_CAUSES, MOVE_REASONS, PESTS, PHENO_STAGES, type RecordKind } from "@yvy/shared";

/** Lo que el flujo necesita saber del campo para decidir qué preguntar. */
interface FlowCtx {
  /** Aguadas y tajamares de la estancia (G-30): si no hay, no se pregunta cuál. */
  waterPois: number;
  /** Hay más de una campaña activa (A-01): si no, el paso de campaña no se pregunta. */
  askSeason?: boolean;
  /** Hay productos veterinarios en el catálogo (E-13): si no, el tratamiento se escribe a mano. */
  vetProducts?: boolean;
  /** Hay máquinas en el catálogo (E-16): si no, la máquina se escribe a mano. */
  machines?: boolean;
  /** F-14: campos propios de la organización para este tipo de registro; se preguntan después de los estándar. */
  extraFields?: FormField[];
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
  | { key: string; kind: "text"; question: string; optional?: boolean; /** Si se pide, el texto tiene que cumplirlo para seguir. */ pattern?: RegExp }
  /** Contador grande por categoría de hacienda (G-06): el valor es { vaca: 3, toro: 1, ... }. */
  | { key: string; kind: "counter"; question: string; hint?: string }
  /** Campaña: se elige entre las activas que bajaron al celular. */
  | { key: string; kind: "season"; question: string }
  /** Productos de la mezcla con su dosis (catálogo del celular, o a mano). Guarda ProductDose[]. */
  | { key: string; kind: "products"; question: string; fixedUnit?: "kg_ha"; productTypes?: string[] }
  /** Cierre de la orden de trabajo (E-21): cantidad real gastada por producto. Reescribe `products` con `usedQty`. */
  | { key: "products"; kind: "usage"; question: string; hint?: string }
  /** Un producto del catálogo de ciertos tipos (guarda su id; "otro" salta el paso y se escribe a mano). */
  | { key: string; kind: "catalog"; question: string; productTypes: string[]; otherLabel: string }
  /** Una máquina del catálogo (guarda su id; "otra" salta el paso y se escribe el nombre a mano). */
  | { key: string; kind: "machine"; question: string; otherLabel: string }
  /** Elegir un potrero de la estancia (excluye el de origen). La respuesta es su id. */
  | { key: string; kind: "paddock"; question: string }
  /** Elegir un punto de interés de un tipo (hoy: la aguada). La respuesta es su id; se guarda como poi_id. */
  | { key: string; kind: "poi"; question: string; poiKind: "water" }
  );

const lvl = (prefix: string) => ["low", "medium", "high"].map((v) => ({ value: v, label: `${prefix}${v}` }));
const cond = ["good", "fair", "bad"].map((v) => ({ value: v, label: `fields.condition.${v}` }));

/** Las etiquetas son claves de i18n; la pantalla las traduce. */
/** `track` no se carga con preguntas: lo graba la pantalla de recorrida (F-05). */
export const FLOWS: Record<RecordKind, Step[]> = {
  track: [],
  rain: [{ key: "mm", kind: "number", question: "app.rain.question", hint: "app.rain.hint", unit: "mm", max: 1000 }],
  scouting: [
    { key: "condition", kind: "choice", question: "app.common.scoutQuestion", options: cond },
    { key: "note", kind: "text", question: "app.add.note", optional: true },
  ],
  pest: [
    { key: "pest", kind: "choice", question: "app.pest.question", options: PESTS.map((v) => ({ value: v, label: `fields.pest.${v}` })) },
    { key: "intensity", kind: "choice", question: "app.pest.howMuch", options: lvl("fields.level_") },
    { key: "note", kind: "text", question: "app.add.note", optional: true },
  ],
  crop_status: [
    { key: "stage", kind: "choice", question: "app.crop.question", options: PHENO_STAGES.map((v) => ({ value: v, label: `fields.stage.${v}` })) },
    { key: "condition", kind: "choice", question: "app.crop.how", options: cond },
    { key: "note", kind: "text", question: "app.add.note", optional: true },
  ],
  pasture_status: [
    { key: "heightCm", kind: "number", question: "app.pasture.question", unit: "cm", max: 500 },
    { key: "cover", kind: "choice", question: "app.pasture.cover", options: lvl("fields.level_") },
    { key: "livestockPresent", kind: "yesno", question: "app.pasture.livestock" },
  ],
  water: [
    { key: "poiId", kind: "poi", question: "app.water.poiQuestion", poiKind: "water", skipIf: (_a, ctx) => ctx.waterPois === 0 },
    {
      key: "level",
      kind: "choice",
      question: "app.water.question",
      options: ["full", "half", "low", "dry"].map((v) => ({ value: v, label: `fields.water.${v}` })),
    },
    { key: "note", kind: "text", question: "app.add.note", optional: true },
  ],
  note: [{ key: "text", kind: "text", question: "app.common.noteQuestion" }],
  // ganaderia
  herd_count: [{ key: "counts", kind: "counter", question: "app.herd.countQuestion", hint: "app.herd.countHint" }],
  // En una venta no hay destino; en una compra el potrero elegido al empezar es el destino (ver annotate/index.tsx).
  herd_move: [
    {
      key: "reason",
      kind: "choice",
      question: "app.move.reasonQuestion",
      options: MOVE_REASONS.map((v) => ({ value: v, label: `fields.move.reason_${v}` })),
    },
    {
      key: "toPlotId",
      kind: "paddock",
      question: "app.move.toQuestion",
      skipIf: (a) => a.reason === "venta" || a.reason === "compra",
    },
    { key: "counts", kind: "counter", question: "app.move.countQuestion", hint: "app.herd.countHint" },
  ],
  // La foto es el último paso común de todos los flujos.
  mortality: [
    {
      key: "category",
      kind: "choice",
      question: "app.mortality.categoryQuestion",
      options: HERD_CATEGORIES.map((v) => ({ value: v, label: `fields.herd.${v}` })),
    },
    { key: "head", kind: "number", question: "app.mortality.headQuestion", unit: "cabezas", max: 1000, integer: true, min: 1 },
    {
      key: "cause",
      kind: "choice",
      question: "app.mortality.causeQuestion",
      options: MORTALITY_CAUSES.map((v) => ({ value: v, label: `fields.cause.${v}` })),
    },
  ],
  theft: [
    {
      key: "category",
      kind: "choice",
      question: "app.theft.categoryQuestion",
      options: HERD_CATEGORIES.map((v) => ({ value: v, label: `fields.herd.${v}` })),
    },
    { key: "head", kind: "number", question: "app.theft.headQuestion", hint: "app.theft.headHint", unit: "cabezas", max: 1000, integer: true, min: 1 },
    { key: "policeReport", kind: "text", question: "app.theft.reportQuestion", optional: true },
  ],
  // Reproducción: servicio, tacto, parición o destete; de un lote de vacas o de una sola con caravana.
  reproduction: [
    {
      key: "event",
      kind: "choice",
      question: "app.repro.eventQuestion",
      options: REPRO_EVENTS.map((v) => ({ value: v, label: `fields.repro.event_${v}` })),
    },
    { key: "tag", kind: "text", question: "app.repro.tagQuestion", optional: true, pattern: ANIMAL_TAG_RE },
    {
      key: "head",
      kind: "number",
      question: "app.repro.headQuestion",
      unit: "vacas",
      max: 100_000,
      integer: true,
      min: 1,
      skipIf: (a) => !!a.tag || a.event === "weaning",
    },
    {
      key: "head",
      kind: "number",
      question: "app.repro.weanedQuestion",
      unit: "terneros",
      max: 100_000,
      integer: true,
      min: 1,
      skipIf: (a) => !!a.tag || a.event !== "weaning",
    },
    {
      key: "method",
      kind: "choice",
      question: "app.repro.methodQuestion",
      optional: true,
      options: SERVICE_METHODS.map((v) => ({ value: v, label: `fields.repro.method_${v}` })),
      skipIf: (a) => a.event !== "service",
    },
    {
      key: "pregnant",
      kind: "number",
      question: "app.repro.pregnantQuestion",
      hint: "app.repro.pregnantHint",
      unit: "preñadas",
      max: 100_000,
      integer: true,
      skipIf: (a) => a.event !== "pregnancy_check",
    },
    {
      key: "calves",
      kind: "number",
      question: "app.repro.calvesQuestion",
      unit: "terneros",
      max: 100_000,
      integer: true,
      optional: true,
      skipIf: (a) => a.event !== "calving",
    },
  ],
  // Pesada: de un lote de animales o de uno solo con caravana. Todo salvo el peso es opcional.
  weighing: [
    { key: "kg", kind: "number", question: "app.weighing.kgQuestion", hint: "app.weighing.kgHint", unit: "kg", max: 2000 },
    { key: "tag", kind: "text", question: "app.weighing.tagQuestion", optional: true, pattern: ANIMAL_TAG_RE },
    { key: "group", kind: "text", question: "app.weighing.groupQuestion", optional: true, skipIf: (a) => !!a.tag },
    { key: "head", kind: "number", question: "app.weighing.headQuestion", unit: "cabezas", max: 100_000, integer: true, min: 1, optional: true, skipIf: (a) => !!a.tag },
  ],
  supplement: [
    {
      key: "type",
      kind: "choice",
      question: "app.supplement.typeQuestion",
      options: SUPPLEMENT_TYPES.map((v) => ({ value: v, label: `fields.supplement.type_${v}` })),
    },
    { key: "kg", kind: "number", question: "app.supplement.kgQuestion", hint: "app.supplement.kgHint", unit: "kg", max: 100_000 },
    { key: "note", kind: "text", question: "app.add.note", optional: true },
  ],
  health: [
    {
      key: "reason",
      kind: "choice",
      question: "app.health.reasonQuestion",
      options: HEALTH_REASONS.map((v) => ({ value: v, label: `fields.health.reason_${v}` })),
    },
    // Con un producto del catálogo el ERP descuenta el stock (E-13); si no, se escribe a mano como siempre.
    {
      key: "productId",
      kind: "catalog",
      question: "app.health.productQuestion",
      productTypes: ["veterinary"],
      otherLabel: "app.health.productOther",
      skipIf: (_a, ctx) => !ctx.vetProducts,
    },
    { key: "product", kind: "text", question: "app.health.productQuestion", skipIf: (a) => !!a.productId },
    { key: "quantity", kind: "number", question: "app.health.quantityQuestion", hint: "app.health.quantityHint", unit: "", max: 1_000_000, skipIf: (a) => !a.productId },
    { key: "dose", kind: "text", question: "app.health.doseQuestion", optional: true },
    { key: "counts", kind: "counter", question: "app.health.countQuestion", hint: "app.herd.countHint" },
    { key: "tag", kind: "text", question: "app.health.tagQuestion", optional: true, pattern: ANIMAL_TAG_RE },
    { key: "note", kind: "text", question: "app.add.note", optional: true },
  ],
  application: [
    { key: "seasonId", kind: "season", question: "app.common.seasonQuestion", skipIf: (_a, ctx) => !ctx.askSeason },
    { key: "products", kind: "products", question: "app.products.question" },
    { key: "volumeLHa", kind: "number", question: "app.common.volumeQuestion", unit: "L/ha", max: 2000, optional: true },
    { key: "areaHa", kind: "number", question: "app.area.doneQuestion", hint: "app.area.doneHint", unit: "ha", max: 100_000, optional: true },
    { key: "windKmh", kind: "number", question: "app.wind.question", hint: "app.wind.hint", unit: "km/h", max: 200, optional: true },
    { key: "tempC", kind: "number", question: "app.common.tempQuestion", unit: "°C", max: 60, optional: true },
    { key: "humidityPct", kind: "number", question: "app.humidity.question", hint: "app.humidity.hint", unit: "%", max: 100, optional: true },
    { key: "products", kind: "usage", question: "app.usage.question", hint: "app.usage.hint", skipIf: (a) => !a.orderTaskId },
    { key: "note", kind: "text", question: "app.add.note", optional: true },
  ],
  fertilization: [
    { key: "seasonId", kind: "season", question: "app.common.seasonQuestion", skipIf: (_a, ctx) => !ctx.askSeason },
    { key: "products", kind: "products", question: "app.fert.productsQuestion", fixedUnit: "kg_ha", productTypes: ["fertilizer"] },
    { key: "method", kind: "choice", question: "app.fert.methodQuestion", options: FERT_METHODS.map((v) => ({ value: v, label: `fields.method.${v}` })) },
    { key: "areaHa", kind: "number", question: "app.area.doneQuestion", hint: "app.area.doneHint", unit: "ha", max: 100_000, optional: true },
    { key: "products", kind: "usage", question: "app.usage.question", hint: "app.usage.hint", skipIf: (a) => !a.orderTaskId },
    { key: "note", kind: "text", question: "app.add.note", optional: true },
  ],
  // Riego (A-43): la lámina y el método; la fecha es la de la carga (appliedAt, en annotate/index.tsx).
  irrigation: [
    { key: "mm", kind: "number", question: "app.irrigation.mmQuestion", hint: "app.irrigation.mmHint", unit: "mm", max: LIMITS.irrigation.maxMm },
    { key: "method", kind: "choice", question: "app.irrigation.methodQuestion", options: IRRIGATION_METHODS.map((v) => ({ value: v, label: `fields.irrigation.method_${v}` })) },
    { key: "note", kind: "text", question: "app.add.note", optional: true },
  ],
  // Combustible (E-16): máquina, litros y horómetro. El ERP descuenta el stock y carga el costo.
  fuel_load: [
    { key: "machineId", kind: "machine", question: "app.fuel.machineQuestion", otherLabel: "app.fuel.machineOther", skipIf: (_a, ctx) => !ctx.machines },
    { key: "machine", kind: "text", question: "app.fuel.machineQuestion", skipIf: (a) => !!a.machineId },
    { key: "liters", kind: "number", question: "app.fuel.litersQuestion", hint: "app.fuel.litersHint", unit: "l", max: 100_000 },
    { key: "meterValue", kind: "number", question: "app.fuel.meterQuestion", hint: "app.fuel.meterHint", unit: "", max: 10_000_000, optional: true },
    { key: "note", kind: "text", question: "app.add.note", optional: true },
  ],
  // Recuento de depósito (E-15): tiene su propia pantalla, no pasa por este asistente.
  stock_count: [],
  // Ración suministrada (G-33): se carga desde la web.
  feed: [],
  harvest: [
    { key: "seasonId", kind: "season", question: "app.common.seasonQuestion", skipIf: (_a, ctx) => !ctx.askSeason },
    { key: "tons", kind: "number", question: "app.tons.question", hint: "app.tons.hint", unit: "t", max: 1_000_000 },
    { key: "moisturePct", kind: "number", question: "app.moisture.question", hint: "app.moisture.hint", unit: "%", max: 100, optional: true },
    { key: "areaHa", kind: "number", question: "app.area.doneQuestion", hint: "app.area.doneHint", unit: "ha", max: 100_000, optional: true },
    {
      key: "destination",
      kind: "choice",
      question: "app.common.destinationQuestion",
      optional: true,
      options: HARVEST_DESTINATIONS.map((v) => ({ value: v, label: `fields.destination.${v}` })),
    },
    { key: "note", kind: "text", question: "app.add.note", optional: true },
  ],
  sowing: [
    { key: "seasonId", kind: "season", question: "app.common.seasonQuestion", skipIf: (_a, ctx) => !ctx.askSeason },
    { key: "crop", kind: "choice", question: "app.common.sowingCropQuestion", options: CROPS.map((v) => ({ value: v, label: `fields.crop.${v}` })) },
    { key: "variety", kind: "text", question: "app.common.varietyQuestion", optional: true },
    {
      key: "densityUnit",
      kind: "choice",
      question: "app.density.unitQuestion",
      optional: true,
      options: DENSITY_UNITS.map((v) => ({ value: v, label: `fields.density.unit_${v}` })),
    },
    { key: "density", kind: "number", question: "app.density.question", unit: "", max: 1_000_000, skipIf: (a) => a.densityUnit === undefined },
    { key: "areaHa", kind: "number", question: "app.area.doneQuestion", hint: "app.area.doneHint", unit: "ha", max: 100_000, optional: true },
    { key: "note", kind: "text", question: "app.add.note", optional: true },
  ],
};

/** Prefijo de los textos que ya vienen escritos por la organización (no son claves de i18n). */
export const RAW = "raw:";

/** F-14: un paso por cada campo propio. Las respuestas quedan en `extra.<id>` y al guardar pasan a `data.extra`. */
export const extraSteps = (fields: FormField[] = []): Step[] =>
  fields.map((f): Step => {
    const key = `${EXTRA_PREFIX}${f.id}`;
    const question = `${RAW}${f.label}`;
    const optional = !f.required;
    if (f.type === "number") return { key, kind: "number", question, unit: f.unit ?? "", max: 1_000_000_000, min: -1_000_000_000, optional };
    if (f.type === "choice") return { key, kind: "choice", question, optional, options: (f.options ?? []).map((o) => ({ value: o, label: `${RAW}${o}` })) };
    if (f.type === "yesno") return { key, kind: "yesno", question };
    return { key, kind: "text", question, optional };
  });

/** Pasos que se preguntan dado lo respondido hasta ahora (los estándar y, al final, los campos propios). */
export const stepsFor = (kind: RecordKind | null, answers: Record<string, unknown>, ctx: FlowCtx = { waterPois: 0, askSeason: false }): Step[] =>
  kind ? [...FLOWS[kind], ...extraSteps(ctx.extraFields)].filter((s) => !s.skipIf?.(answers, ctx)) : [];

/** Pasos de una lista dada con lo contestado hasta ahora (campaña solo si hay más de una activa). */
export const visibleSteps = (steps: Step[], values: Record<string, unknown>, ctx: { askSeason: boolean }): Step[] =>
  steps.filter((s) => !s.skipIf?.(values, { waterPois: 0, askSeason: ctx.askSeason }));

/** Qué se puede anotar en cada tipo de lote, en el orden de frecuencia real. */
export const KINDS_FOR = (plotKind: "crop" | "pasture" | null): RecordKind[] =>
  plotKind === "pasture"
    ? ["pasture_status", "herd_count", "herd_move", "mortality", "theft", "supplement", "weighing", "reproduction", "health", "rain", "water", "pest", "scouting", "note"]
    : plotKind === "crop"
      ? ["scouting", "pest", "crop_status", "application", "fertilization", "irrigation", "sowing", "harvest", "fuel_load", "rain", "water", "note"]
      : ["rain", "scouting", "water", "weighing", "reproduction", "health", "note", "pest", "crop_status", "pasture_status", "application", "fertilization", "irrigation", "sowing", "harvest", "fuel_load"];

/** Registros de hacienda: son de un solo potrero, no se cargan en varios a la vez (F-10). */
export const SINGLE_PLOT_KINDS: readonly RecordKind[] = ["herd_count", "herd_move", "mortality", "theft", "supplement", "weighing", "reproduction", "health"];
