/** Formato del informe de riesgo climático, compartido por la pantalla y el PDF. La cuenta está en @yvy/shared; acá, el nombre del mes con Intl. */
import { pctOfNormal, riskFormat } from "@yvy/shared";

/** Respuesta del informe de riesgo climático de una estancia (tipo de @yvy/shared). */
export type { RiskResponse } from "@yvy/shared";
/** Porcentaje de un valor respecto de la normal (función de @yvy/shared, reexportada). */
export { pctOfNormal };

const monthLong = new Intl.DateTimeFormat("es-PY", { month: "long", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("es-PY", { month: "short", timeZone: "UTC" });

/** 1..12 → "enero" / "ene". */
export const monthName = (m: number, short = false): string =>
  (short ? monthShort : monthLong).format(new Date(Date.UTC(2001, m - 1, 15))).replace(".", "");

/** Formatea un día "MM-DD" como día y mes legibles, con el nombre del mes en es-PY. */
export const { fmtMmDd, fmtYearMonth, rainByMonth, fireByMonth } = riskFormat(monthName);
