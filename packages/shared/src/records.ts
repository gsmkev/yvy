/**
 * Esquemas de los 7 tipos de registro (PRD RF-30). Única definición: app, web y Worker importan esto.
 * Subir RECORD_SCHEMA_VERSION al cambiar un esquema de forma incompatible.
 */
import { z } from "zod";
import { SUPPLEMENT_TYPES, MAX_SUPPLEMENT_KG } from "./grazing";
import { HEALTH_REASONS, HERD_CATEGORIES, MAX_HEAD_PER_CATEGORY, MORTALITY_CAUSES, MOVE_REASONS } from "./livestock";
import { deltaT, DOSE_UNITS } from "./agro";
import { CROPS, type RecordKind } from "./schema";
import { LIMITS } from "./limits";

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
};
// ---------- fin ganaderia ----------
/** Unidad de la densidad de siembra: semillas por metro lineal o kg por hectárea. */
export const DENSITY_UNITS = ["seeds_m", "kg_ha"] as const;

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
});
/** Fertilizante: siempre kg/ha. */
export const fertilizerDose = productDose.extend({ unit: z.literal("kg_ha") });
export const HARVEST_DESTINATIONS = ["silo", "acopio", "industry", "other"] as const;
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

export const parseRecordData = (kind: RecordKind, data: unknown) => recordDataSchemas[kind].safeParse(data);
