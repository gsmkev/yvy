export const day = (ms: number) => new Date(ms).toLocaleDateString("es-PY", { day: "numeric", month: "short" });
export const num = (v: number, digits: number) =>
  v.toLocaleString("es-PY", { minimumFractionDigits: digits, maximumFractionDigits: digits });
