/** Recuento de depósito (E-15): arma el registro `stock_count` a partir de lo que se escribió. TS puro, sin React Native. */
import { parseRecordData } from "@yvy/shared";

/** Quién cuenta: dueño, administrador y agrónomo; el empleado no entra al ERP. */
export const canCount = (role: string | undefined): boolean => role === "owner" || role === "admin" || role === "agronomist";

/** "12,5" y "12.5" son lo mismo; vacío o no numérico no se cuenta; negativo tampoco. */
export function parseCounted(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Datos del registro con solo los productos que se contaron; null si no hay ninguno o no pasa el esquema. */
export function buildCountData(warehouseId: string, values: Record<string, string>, note?: string): Record<string, unknown> | null {
  const lines = Object.entries(values).flatMap(([productId, raw]) => {
    const counted = parseCounted(raw);
    return counted === null ? [] : [{ productId, counted }];
  });
  if (!lines.length) return null;
  const data = { warehouseId, lines, ...(note?.trim() ? { note: note.trim() } : {}) };
  return parseRecordData("stock_count", data).success ? data : null;
}
