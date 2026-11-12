/**
 * Esquemas de los 7 tipos de registro (PRD RF-30). Única definición: app, web y Worker importan esto.
 * Subir RECORD_SCHEMA_VERSION al cambiar un esquema de forma incompatible.
 */
import { z } from "zod";
import { animalTag, MAX_WEIGHT_KG } from "./animals";
import { REPRO_EVENTS, SERVICE_METHODS } from "./repro";
import { SUPPLEMENT_TYPES, MAX_SUPPLEMENT_KG } from "./grazing";
import { HEALTH_REASONS, HERD_CATEGORIES, MAX_HEAD_PER_CATEGORY, MORTALITY_CAUSES, MOVE_REASONS } from "./livestock";
import { deltaT, DOSE_UNITS } from "./agro";
import { CROPS, DENSITY_UNITS, type RecordKind } from "./schema";
import { LIMITS } from "./limits";
import { extraSchema } from "./forms";

export const RECORD_SCHEMA_VERSION = 1;

const note = z.string().trim().max(2000).optional();
const uuidStr = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "uuid inválido");
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
  /** El potrero es records.plot_id; la foto va como adjunto del registro. */
  mortality: z.object({
    category: z.enum(HERD_CATEGORIES),
    head: z.number().int().min(1).max(MAX_HEAD_PER_CATEGORY),
    cause: z.enum(MORTALITY_CAUSES),
    note,
  }),
  /**
   * Producto en texto libre o del catálogo (productId): con productId y cantidad, el ERP descuenta el stock (E-13).
   * `quantity` va en la unidad del producto (l o kg). El potrero es opcional.
   */
  health: z.object({
    reason: z.enum(HEALTH_REASONS),
    product: z.string().trim().min(1).max(120),
    productId: uuidStr.optional(),
    quantity: z.number().positive().max(1_000_000).optional(),
    dose: z.string().trim().max(80).optional(),
    counts: herdCountsSchema,
    /** Caravana del animal tratado, si fue uno solo (G-21): arma su historial. */
    tag: animalTag.optional(),
    note,
  }),
  /**
   * Abigeato (G-13): cabezas que faltan después de un conteo. El potrero es records.plot_id y la fecha del aviso es
   * capturedAt. `reportedAt` (epoch ms) y `policeReport` (número de denuncia) se completan cuando se hace la denuncia.
   * Descuenta de la hacienda del potrero, igual que la mortandad.
   */
  theft: z.object({
    category: z.enum(HERD_CATEGORIES),
    head: z.number().int().min(1).max(MAX_HEAD_PER_CATEGORY),
    reportedAt: z.number().int().nonnegative().optional(),
    policeReport: z.string().trim().min(1).max(40).optional(),
    note,
  }),
  /** Suplementación y sal mineral (G-31): kilos dados en un potrero (records.plot_id). */
  supplement: z.object({
    type: z.enum(SUPPLEMENT_TYPES),
    kg: z.number().positive().max(MAX_SUPPLEMENT_KG),
    /** Marca o fórmula, si importa. */
    product: z.string().trim().min(1).max(120).optional(),
    note,
  }),
  /**
   * Pesada (G-22): peso promedio por cabeza de un lote de animales (`group`, `head`) o de un animal con caravana
   * (`tag`, un solo animal). El potrero es opcional: la manga muchas veces no está en un potrero.
   */
  weighing: z
    .object({
      kg: z.number().positive().max(MAX_WEIGHT_KG),
      head: z.number().int().min(1).max(MAX_HEAD_PER_CATEGORY).optional(),
      group: z.string().trim().min(1).max(60).optional(),
      category: z.enum(HERD_CATEGORIES).optional(),
      tag: animalTag.optional(),
      note,
    })
    .refine((d) => d.tag === undefined || d.head === undefined || d.head === 1, {
      message: "Una pesada con caravana es de un solo animal",
    }),
  /**
   * Reproducción (G-20): servicio, tacto, parición o destete. `head` son vacas (servidas, tactadas o paridas) o
   * terneros destetados; con caravana es 1. Índices en packages/shared/src/repro.ts.
   */
  reproduction: z
    .object({
      event: z.enum(REPRO_EVENTS),
      head: z.number().int().min(1).max(MAX_HEAD_PER_CATEGORY).default(1),
      method: z.enum(SERVICE_METHODS).optional(),
      pregnant: z.number().int().min(0).max(MAX_HEAD_PER_CATEGORY).optional(),
      calves: z.number().int().min(0).max(MAX_HEAD_PER_CATEGORY).optional(),
      tag: animalTag.optional(),
      note,
    })
    .refine((d) => d.event !== "pregnancy_check" || d.pregnant !== undefined, {
      message: "Indicá cuántas están preñadas",
    })
    .refine((d) => d.pregnant === undefined || d.pregnant <= d.head, {
      message: "No puede haber más preñadas que tactadas",
    })
    .refine((d) => d.tag === undefined || d.head === 1, {
      message: "Un registro con caravana es de un solo animal",
    }),
};
// ---------- fin ganaderia ----------
export { DENSITY_UNITS } from "./schema";

/** Superficie hecha en hectáreas (aplicaciones, siembra, cosecha). */
const areaDone = z.number().positive().max(100_000);
const seasonId = uuidStr.optional();
/** Orden de trabajo (tarea) que se está cerrando con este registro (E-21), y horas de máquina si se cobra por hora. */
const orderTaskId = uuidStr.optional();
const hours = z.number().positive().max(1000).optional();

/** Producto de una aplicación: del catálogo (productId) o escrito a mano en el campo (solo name). */
export const productDose = z.object({
  productId: uuidStr.optional(),
  name: z.string().trim().min(1).max(120),
  dose: z.number().positive().max(100_000),
  unit: z.enum(DOSE_UNITS),
  /**
   * Cantidad total realmente usada (E-21), en la unidad de la dosis sin "/ha" (L, mL, kg o g). Si falta, el consumo es
   * la dosis por la superficie hecha; si está, descuenta el stock por esta cantidad.
   */
  usedQty: z.number().positive().max(1_000_000_000).optional(),
});
/** Fertilizante: siempre kg/ha. */
export const fertilizerDose = productDose.extend({ unit: z.literal("kg_ha") });
export const HARVEST_DESTINATIONS = ["silo", "acopio", "industry", "other"] as const;
export const IRRIGATION_METHODS = ["pivot", "sprinkler", "drip", "furrow", "flood"] as const;
export const FERT_METHODS = ["broadcast", "banded", "foliar", "fertigation"] as const;
export type ProductDose = z.infer<typeof productDose>;

/** Receta del agrónomo: qué aplicar y a qué dosis. Viaja dentro de la tarea (tasks.prescription). */
export const prescriptionSchema = z.object({
  seasonId,
  products: z.array(productDose).min(1).max(10),
  volumeLHa: z.number().positive().max(2000).optional(),
  note,
});
export type Prescription = z.infer<typeof prescriptionSchema>;

/** Recorrida GPS (F-05): línea ya simplificada (Douglas-Peucker en el celular), distancia y tiempo reales. */
export const trackSchema = z
  .object({
    line: z
      .array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]))
      .min(2)
      .max(LIMITS.track.maxPoints),
    distanceM: z.number().nonnegative().max(1_000_000),
    durationS: z.number().int().nonnegative().max(LIMITS.track.maxDurationS),
    startedAt: z.number().int().nonnegative(),
    endedAt: z.number().int().nonnegative(),
    note,
  })
  .refine((d) => d.endedAt >= d.startedAt, { message: "La recorrida termina antes de empezar" });
export type TrackData = z.infer<typeof trackSchema>;
/** Labores de una orden de trabajo (E-20) y el tipo de registro con que se cierran (E-21). */
export const ORDER_LABORS = ["spraying", "fertilizing", "sowing", "harvest", "other"] as const;
export type OrderLabor = (typeof ORDER_LABORS)[number];
export const ORDER_LABOR_KIND: Record<OrderLabor, RecordKind | null> = {
  spraying: "application",
  fertilizing: "fertilization",
  sowing: "sowing",
  harvest: "harvest",
  other: null,
};

/**
 * Orden de trabajo (E-20): viaja dentro de la tarea (tasks.work_order), una tarea por lote. El operario es el
 * responsable de la tarea; si la hace un contratista, `contractorId` define cuánto cuesta. Al cerrarla desde la app
 * se carga el registro de campo con la superficie y los consumos reales (`orderTaskId` lo liga a la tarea).
 */
export const orderSchema = z.object({
  labor: z.enum(ORDER_LABORS),
  seasonId,
  /** Superficie prevista por lote en hectáreas; si falta, la del lote. */
  areaHa: z.number().positive().max(100_000).optional(),
  products: z.array(productDose).max(10).default([]),
  volumeLHa: z.number().positive().max(2000).optional(),
  machineId: uuidStr.optional(),
  machine: z.string().trim().min(1).max(80).optional(),
  contractorId: uuidStr.optional(),
  note,
});
export type WorkOrder = z.infer<typeof orderSchema>;

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
  track: trackSchema,
  ...livestockSchemas,
  sowing: z
    .object({
      seasonId,
      orderTaskId,
      hours,
      crop: z.enum(CROPS),
      variety: z.string().trim().min(1).max(80).optional(),
      density: z.number().positive().max(1_000_000).optional(),
      densityUnit: z.enum(DENSITY_UNITS).optional(),
      areaHa: areaDone.optional(),
      note,
    })
    .refine((d) => d.density === undefined || d.densityUnit !== undefined, {
      message: "Indicá la unidad de la densidad",
    }),
  /**
   * Riego (A-43): lámina aplicada en el lote (records.plot_id), en mm sobre toda su superficie. `appliedAt` (epoch ms)
   * es cuándo se regó; si falta, vale capturedAt. Entra al balance hídrico del lote.
   */
  irrigation: z.object({
    mm: z.number().positive().max(LIMITS.irrigation.maxMm),
    appliedAt: z.number().int().nonnegative().optional(),
    method: z.enum(IRRIGATION_METHODS),
    note,
  }),
  /**
   * Ración suministrada a un corral (G-33): el corral es records.plot_id. `kgDm` es la materia seca dada; `items` son los
   * kilos tal cual de cada ingrediente del catálogo (la web los calcula con la ración vigente, y quedan como historia
   * aunque la ración cambie). Descuenta el stock de los ingredientes y carga el costo (E-13). Se carga desde la web.
   */
  feed: z.object({
    rationId: uuidStr.optional(),
    ration: z.string().trim().min(1).max(80),
    kgDm: z.number().positive().max(LIMITS.feedlot.maxKgDm),
    head: z.number().int().min(1).max(MAX_HEAD_PER_CATEGORY * 5).optional(),
    items: z
      .array(z.object({ productId: uuidStr, name: z.string().trim().min(1).max(120), kg: z.number().positive().max(10_000_000) }))
      .min(1)
      .max(LIMITS.feedlot.maxRationItems),
    note,
  }),
  fertilization: z.object({
    seasonId,
    orderTaskId,
    hours,
    products: z.array(fertilizerDose).min(1).max(10),
    method: z.enum(FERT_METHODS),
    areaHa: areaDone.optional(),
    note,
  }),
  harvest: z.object({
    seasonId,
    orderTaskId,
    hours,
    tons: z.number().positive().max(1_000_000),
    moisturePct: z.number().min(0).max(100).optional(),
    areaHa: areaDone.optional(),
    destination: z.enum(HARVEST_DESTINATIONS).optional(),
    note,
  }),
  /**
   * Carga de combustible de una máquina (E-16): litros y horómetro u odómetro. `machineId` es de la tabla machines
   * (baja al celular); `machine` es el nombre, para cuando la máquina no está cargada. Descuenta el stock del
   * combustible (`productId`, o el único producto de tipo combustible del catálogo) y carga el costo (E-13).
   */
  fuel_load: z.object({
    machineId: uuidStr.optional(),
    machine: z.string().trim().min(1).max(80),
    liters: z.number().positive().max(100_000),
    meterValue: z.number().min(0).max(10_000_000).optional(),
    productId: uuidStr.optional(),
    note,
  }),
  /**
   * Recuento físico de un depósito (E-15), contado en el galpón sin señal. `counted` es lo que hay, no la diferencia:
   * al llegar al servidor, la diferencia con el stock de ese momento se asienta como ajuste (origin "adjustment",
   * con el id del registro). Editar o borrar el registro revierte esos ajustes.
   */
  stock_count: z.object({
    warehouseId: uuidStr,
    lines: z
      .array(z.object({ productId: uuidStr, counted: z.number().min(0).max(1_000_000_000) }))
      .min(1)
      .max(60)
      .refine((l) => new Set(l.map((x) => x.productId)).size === l.length, "Un producto aparece dos veces"),
    note,
  }),
  application: z
    .object({
      seasonId,
      orderTaskId,
      hours,
      products: z.array(productDose).min(1).max(10),
      volumeLHa: z.number().positive().max(2000).optional(),
      areaHa: areaDone.optional(),
      windKmh: z.number().nonnegative().max(200).optional(),
      tempC: z.number().min(-20).max(60).optional(),
      humidityPct: z.number().min(0).max(100).optional(),
      machine: z.string().trim().min(1).max(80).optional(),
      /** Tarea con la receta que originó la aplicación (A-11). */
      prescriptionTaskId: uuidStr.optional(),
      note,
    })
    // Delta T se calcula siempre acá: la app, la web y el Worker guardan el mismo número.
    .transform((d): typeof d & { deltaT?: number } => {
      const dt = d.tempC !== undefined && d.humidityPct !== undefined ? deltaT(d.tempC, d.humidityPct) : null;
      return dt === null ? d : { ...d, deltaT: dt };
    }),
} satisfies Record<RecordKind, z.ZodType>;

export type RecordData<K extends RecordKind> = z.infer<(typeof recordDataSchemas)[K]>;

/**
 * Valida los datos de un registro. Los campos propios de la organización (F-14) van aparte, en `data.extra`, y se
 * validan con un esquema genérico; el resto, con el esquema del tipo. Sin `extra` el resultado es el de siempre.
 */
export const parseRecordData = (kind: RecordKind, data: unknown) => {
  if (data === null || typeof data !== "object" || Array.isArray(data) || !("extra" in data)) return recordDataSchemas[kind].safeParse(data);
  const { extra, ...rest } = data as Record<string, unknown>;
  const base = recordDataSchemas[kind].safeParse(rest);
  if (!base.success) return base;
  if (extra === undefined) return base;
  const e = extraSchema.safeParse(extra);
  if (!e.success) return { success: false as const, error: e.error };
  return { success: true as const, data: { ...(base.data as object), extra: e.data } as unknown as typeof base.data };
};
