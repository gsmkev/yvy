/** Categorías de hacienda, en el orden en que se muestran. */
export const HERD_CATEGORIES = ["vaca", "vaquilla", "novillo", "ternero", "toro"] as const;
export type HerdCategory = (typeof HERD_CATEGORIES)[number];
