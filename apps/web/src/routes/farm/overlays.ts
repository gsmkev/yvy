import { FERT_LAYERS, INDEX_KINDS, type FertLayerKey } from "@yvy/shared";

/** Capas que se ven en Vigor: índices de vegetación y mapas de fertilidad. */
export const OVERLAYS = [...INDEX_KINDS, ...FERT_LAYERS] as const;
/** Capa que se puede mostrar en Vigor. */
export type Overlay = (typeof OVERLAYS)[number];
/** Si la capa es un mapa de fertilidad y no un índice de vegetación. */
export const isFert = (k: Overlay): k is FertLayerKey => (FERT_LAYERS as readonly string[]).includes(k);
