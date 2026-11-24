/** Fecha corta (día y mes) en es-PY. */
export const day = (ms: number) => new Date(ms).toLocaleDateString("es-PY", { day: "numeric", month: "short" });
/** Número en es-PY con `digits` decimales fijos. */
export const num = (v: number, digits: number) =>
  v.toLocaleString("es-PY", { minimumFractionDigits: digits, maximumFractionDigits: digits });
