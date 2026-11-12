/** Lógica pura del contador rápido de hacienda (G-06): sin React, para probarla sin dispositivo. */
import { HERD_CATEGORIES, MAX_HEAD_PER_CATEGORY, totalHead, type HerdCategory, type HerdCounts } from "@yvy/shared";

/** Suma `delta` cabezas a una categoría, sin bajar de 0 ni pasar del tope. Marca la categoría como contada. */
export function bump(counts: HerdCounts, cat: HerdCategory, delta: number): HerdCounts {
  const next = Math.min(MAX_HEAD_PER_CATEGORY, Math.max(0, (counts[cat] ?? 0) + delta));
  return { ...counts, [cat]: next };
}

/** Pone un valor tipeado (acepta texto con basura); vacío = 0. */
export function setTyped(counts: HerdCounts, cat: HerdCategory, text: string): HerdCounts {
  const digits = text.replace(/[^0-9]/g, "").slice(0, 6);
  return { ...counts, [cat]: Math.min(MAX_HEAD_PER_CATEGORY, digits === "" ? 0 : Number(digits)) };
}

/** Todas las categorías en cero: "el potrero está vacío". */
export const allZero = (): HerdCounts => Object.fromEntries(HERD_CATEGORIES.map((k) => [k, 0])) as HerdCounts;

/** ¿Se puede seguir? Hace falta haber tocado al menos una categoría (un 0 tocado cuenta). */
export const canContinue = (counts: HerdCounts): boolean => HERD_CATEGORIES.some((k) => counts[k] !== undefined);

/** Total que se muestra al pie del contador. */
export const counterTotal = (counts: HerdCounts): number => totalHead(counts);

/** Valor inicial de un conteo a partir de lo que ya se calcula para el potrero (null = parte de cero). */
export function seedCounts(current: HerdCounts | null): HerdCounts {
  if (!current) return {};
  return Object.fromEntries(HERD_CATEGORIES.map((k) => [k, current[k] ?? 0])) as HerdCounts;
}
