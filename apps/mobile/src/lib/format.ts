/** Formato es-PY: número con coma decimal y punto de miles, guaraníes sin decimales, fechas dd/mm/aaaa. */
export const fmtNum = (n: number, digits = 1): string => n.toLocaleString("es-PY", { maximumFractionDigits: digits });
export const fmtMm = (n: number): string => `${fmtNum(n)} mm`;
export const fmtGs = (n: number): string => `${Math.round(n).toLocaleString("es-PY")} Gs`;

/** dd/mm/aaaa de un instante, en la hora de Paraguay. */
export const fmtDate = (ms: number): string => new Date(ms).toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Asuncion" });

/** Hora hh:mm de un instante, en la hora de Paraguay. */
export const fmtTime = (ms: number): string => new Date(ms).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Asuncion" });

/** "dd/mm/aaaa" a "AAAA-MM-DD"; null si no es una fecha válida. */
export function parseDmy(text: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(text);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
