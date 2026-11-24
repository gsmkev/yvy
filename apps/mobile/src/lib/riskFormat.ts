/** Formato del informe de riesgo climático. La cuenta está en @yvy/shared; acá, el nombre del mes sin Intl (Hermes no siempre lo trae completo). */
import { riskFormat } from "@yvy/shared";

/** Respuesta del servicio de riesgo climático. */
export type { RiskResponse } from "@yvy/shared";

const LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** 1..12 → "enero" / "ene". */
const monthName = (m: number, short = false): string => (short ? LONG[m - 1]!.slice(0, 3) : LONG[m - 1]!);

/** Formateadores de fechas y series del riesgo climático, con los meses en es-PY. */
export const { fmtMmDd, rainByMonth, fireByMonth } = riskFormat(monthName);
