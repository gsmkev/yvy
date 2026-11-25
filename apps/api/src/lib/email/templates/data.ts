/** Lectura defensiva de los datos que traen los avisos (JSON de la base) y colores de los lotes por cultivo. */
import { C } from "../layout";

/** Objeto JSON (o su texto) como mapa; cualquier otra cosa da un mapa vacío. */
export const obj = (v: unknown): Record<string, unknown> => {
  if (typeof v === "string") {
    try {
      return obj(JSON.parse(v));
    } catch {
      return {};
    }
  }
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
};
/** Número finito o null. */
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** Lista de objetos (descarta lo que no lo sea). */
export const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
/** Texto o vacío. */
export const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Color del punto de un lote según su cultivo; los potreros van en verde de pasto. */
export function plotColor(crop: string | null, kind?: string): string {
  const c = (crop ?? "").toLowerCase();
  if (c.includes("soja")) return C.soy;
  if (c.includes("ma")) return C.wheat;
  if (c.includes("trigo")) return "#C9C46A";
  if (kind === "pasture" || c.includes("past")) return "#3F6B35";
  return C.sky;
}
