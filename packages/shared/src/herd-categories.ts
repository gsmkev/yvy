/** Categorías de hacienda compartidas por stock, animales y registros. */

/** Categorías de hacienda, en el orden en que se muestran. */
export const HERD_CATEGORIES = ["vaca", "vaquilla", "novillo", "ternero", "toro"] as const;
/** Categoría de hacienda. */
export type HerdCategory = (typeof HERD_CATEGORIES)[number];
