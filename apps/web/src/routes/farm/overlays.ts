import { FERT_LAYERS, INDEX_KINDS, type FertLayerKey } from "@yvy/shared";

/** Capas que se ven en Vigor: índices de vegetación (S-07) y mapas de fertilidad (A-31). */
export const OVERLAYS = [...INDEX_KINDS, ...FERT_LAYERS] as const;
export type Overlay = (typeof OVERLAYS)[number];
export const isFert = (k: Overlay): k is FertLayerKey => (FERT_LAYERS as readonly string[]).includes(k);
