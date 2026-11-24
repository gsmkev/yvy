/** Formato de números, fechas y unidades en es-PY, con la zona horaria de Paraguay. */
import { areaLabel, cToTemp, getUnits, haToArea, mmToRain, rainLabel, tempLabel } from "./units";

const nf = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct1 = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const df = new Intl.DateTimeFormat("es-PY", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Asuncion",
});
const dShort = new Intl.DateTimeFormat("es-PY", { day: "numeric", month: "short", timeZone: "America/Asuncion" });
/** Siempre 24 h (HH:mm), nunca a. m./p. m. */
const dtf = new Intl.DateTimeFormat("es-PY", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Asuncion",
});

/** Número con hasta un decimal. */
export const fmtNum = (n: number) => nf.format(n);
/** NDVI con dos decimales. */
export const fmtNdvi = (n: number) => nf2.format(n);
/** Porcentaje con signo salvo cero. */
export const fmtPct = (n: number) => `${pct1.format(n)} %`;
/** Superficie en la unidad elegida (ha o cuadras), con su sufijo. */
export const fmtHa = (n: number) => `${nf.format(haToArea(n))} ${areaLabel()}`;
/** Solo el número de la superficie (en la unidad elegida) y la unidad, por separado. */
export const fmtAreaValue = (ha: number) => nf.format(haToArea(ha));
/** Etiqueta de la unidad de área elegida. */
export const areaUnitLabel = () => areaLabel();
/** Lluvia en mm o pulgadas (estas con dos decimales). */
export const fmtMm = (mm: number) =>
  getUnits().rain === "in" ? `${nf2.format(mmToRain(mm))} ${rainLabel()}` : `${nf.format(mm)} ${rainLabel()}`;
/** Solo el número de la lluvia, y la unidad por separado. */
export const fmtRainValue = (mm: number) => (getUnits().rain === "in" ? nf2.format(mmToRain(mm)) : nf.format(Math.round(mm)));
/** Etiqueta de la unidad de lluvia elegida. */
export const rainUnitLabel = () => rainLabel();
/** Temperatura en °C o °F. */
export const fmtTemp = (c: number) => `${nf.format(cToTemp(c))} ${tempLabel()}`;
/** Fecha dd/mm/aaaa en hora de Paraguay. */
export const fmtDate = (ms: number) => df.format(new Date(ms));
/** Día y mes abreviado. */
export const fmtDay = (ms: number) => dShort.format(new Date(ms)).replace(".", "");
/** Fecha y hora abreviadas. */
export const fmtDateTime = (ms: number) => dtf.format(new Date(ms)).replace(".", "");
/** Convierte "aaaa-mm-dd" a dd/mm/aaaa. */
export const fmtIsoDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
/** Fecha ISO (aaaa-mm-dd) de un instante en hora de Paraguay. */
export const toIso = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);

/** Zona horaria por defecto de las estancias. */
export const DEFAULT_TZ = "America/Asuncion";

/** Epoch ms del inicio o fin de un día "AAAA-MM-DD" en la zona horaria de la estancia. */
export function dayToMs(day: string, tz: string, end = false): number | undefined {
  if (!day) return undefined;
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const want = Date.UTC(y, m - 1, d, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0);
  let zone = tz || DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("es-PY", { timeZone: zone });
  } catch {
    zone = DEFAULT_TZ;
  }
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const offsetAt = (ms: number) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - Math.floor(ms / 1000) * 1000;
  };
  // Dos pasadas por si el offset cambia (horario de verano) entre la estimación y el resultado.
  let ms = want - offsetAt(want);
  ms = want - offsetAt(ms);
  return ms;
}
