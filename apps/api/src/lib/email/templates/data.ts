/** Lectura defensiva de los datos que traen los avisos (JSON de la base). */
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
