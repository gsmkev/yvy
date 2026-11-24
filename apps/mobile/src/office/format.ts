/** Formatos puros de las pantallas de oficina (es-PY: miles con punto, decimales con coma). */
import { t } from "@yvy/shared";

/** "hace" corto: "un momento", "5 min", "2 h", "3 d". */
export function ageText(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000);
  if (m < 1) return t("office.age.now");
  if (m < 60) return t("office.age.min", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("office.age.hour", { n: h });
  return t("office.age.day", { n: Math.floor(h / 24) });
}

/** Número con separador de miles (punto) y hasta `digits` decimales (coma). Hecho a mano: Hermes no siempre trae Intl completo. */
export function fmtNumber(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  const f = Math.pow(10, digits);
  const r = Math.round(Math.abs(n) * f) / f;
  const [int = "0", dec] = r.toFixed(digits).split(".");
  const dec2 = dec?.replace(/0+$/, "");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 && r !== 0 ? "-" : ""}${grouped}${dec2 ? `,${dec2}` : ""}`;
}

/** Lo que escribe la persona ("12,5", "1.250,5" o "12.5") → número; null si no es un número. */
export function parseDecimal(text: string): number | null {
  const s = text.trim().replace(/\s/g, "");
  if (!s) return null;
  // "1.250,5" (miles con punto) → "1250.5"; "12,5" → "12.5"; "12.5" queda igual.
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  if (!/^-?\d+(\.\d+)?$/.test(norm)) return null;
  return Number(norm);
}

/** "12 nov 2026, 14:30" para una fecha en epoch ms. */
export const fmtDateTime = (ms: number): string =>
  new Date(ms).toLocaleString("es-PY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export const fmtDate = (ms: number): string => new Date(ms).toLocaleDateString("es-PY", { day: "numeric", month: "short" });
