/**
 * Contenido de la landing. Los textos viven en packages/shared/src/i18n (bloque `landing`); acá se arman las listas
 * a partir de las claves numeradas. Los días de prueba salen de LIMITS.trialDays: el mismo número que da el alta.
 */
import { LIMITS } from "@yvy/shared";
import { tk } from "../../../lib/i18n";

export const TRIAL_DAYS = LIMITS.trialDays;

/** Texto de la clave `landing.<key>`. */
export const L = (key: string, vars?: Record<string, string | number>) => tk(`landing.${key}`, vars);

const nums = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export const NAV = [
  { id: "sin-senal", label: () => L("nav.senal") },
  { id: "como-funciona", label: () => L("nav.como") },
  { id: "satelite", label: () => L("nav.satelite") },
  { id: "imprevistos", label: () => L("nav.imprevistos") },
  { id: "tarifas", label: () => L("nav.tarifas") },
  { id: "probar", label: () => L("nav.probar") },
] as const;

export const heroPlotLabels = () => nums(7).map((i) => L(`hero.plot${i}`));

export const sinSenalFacts = () => nums(3).map((i) => ({ k: L(`sinSenal.fact${i}k`), v: L(`sinSenal.fact${i}v`) }));

export const comoSteps = () => nums(4).map((i) => ({ t: L(`como.step${i}t`), d: L(`como.step${i}d`) }));
export const comoPeople = () =>
  nums(3).map((i) => ({ n: L(`como.person${i}`), tasks: [L(`como.person${i}task1`), L(`como.person${i}task2`)] }));
export const comoRecords = () => nums(3).map((i) => L(`como.record${i}`));

export type LayerId = "vigor" | "lluvia" | "temp" | "balance";
export const LAYER_IDS: LayerId[] = ["vigor", "lluvia", "temp", "balance"];
export const layerInfo = (id: LayerId) => ({
  label: L(`satelite.${id}Label`),
  text: L(`satelite.${id}Text`),
  source: L(`satelite.${id}Source`),
  scale: [L(`satelite.${id}Lo`), L(`satelite.${id}Hi`)] as const,
});

/** Marcas de la línea de tiempo de imprevistos (pronóstico de 10 días de MET Norway). */
export const FORECAST_DAYS = 10;
export const imprevistoMarks = () =>
  [
    { day: 4, span: 1, tone: "alerta", text: L("imprevistos.mark1") },
    { day: 6, span: 5, tone: "trigo", text: L("imprevistos.mark2") },
    { day: 8, span: 1, tone: "alerta", text: L("imprevistos.mark3") },
  ] as const;
export const imprevistoIndex = () =>
  nums(4).map((i) => ({ n: L(`imprevistos.item${i}n`), d: L(`imprevistos.item${i}d`), a: L(`imprevistos.item${i}a`) }));

/** Posición de cada estancia de ejemplo sobre el mapa de Paraguay (viewBox 400x430). */
const ESTANCIA_POS = [
  { x: 97, y: 162, warn: true },
  { x: 163, y: 243, warn: false },
  { x: 311, y: 381, warn: true },
] as const;
export const estanciaList = () => ESTANCIA_POS.map((p, i) => ({ ...p, line: L(`estancias.line${i + 1}`) }));

export const reporteRows = () => nums(5).map((i) => ["a", "b", "c", "d"].map((c) => L(`reportes.row${i}${c}`)));
export const reporteEvents = () => nums(3).map((i) => [L(`reportes.event${i}d`), L(`reportes.event${i}t`)] as const);

export const audiences = () => nums(5).map((i) => ({ n: L(`paraQuien.aud${i}n`), g: L(`paraQuien.aud${i}g`) }));

export const datosRows = () => nums(5).map((i) => [L(`datos.row${i}a`), L(`datos.row${i}b`), L(`datos.row${i}c`)] as const);

export const tarifaRows = () =>
  nums(5).map((i) => [L(`tarifas.row${i}k`, { days: TRIAL_DAYS }), L(`tarifas.row${i}v`)] as const);
export const faq = () => nums(5).map((i) => ({ q: L(`tarifas.faq${i}q`), a: L(`tarifas.faq${i}a`) }));

export const ctaCrops = () => nums(6).map((i) => L(`cta.crop${i}`));

/** Atribución del pie: solo las fuentes que Yvy usa, con los textos del bloque `attribution`. */
export const attribution = (year: number) =>
  [
    `${tk("attribution.copernicus")} (2015–${year})`,
    tk("attribution.chirps"),
    tk("attribution.nasaPower"),
    tk("attribution.firms"),
    tk("attribution.metNorway"),
  ].join(". ") + ".";
