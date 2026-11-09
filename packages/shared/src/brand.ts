/** Tokens de marca (PRD §14). */
export const BRAND = {
  lino: "#F1EEE4",
  surco: "#1E2419",
  soja: "#7A9A3F",
  trigo: "#D9A93A",
  cielo: "#8DB3C7",
  alerta: "#D2462B",
} as const;

/** Rampa NDVI de bajo a alto vigor. */
export const NDVI_RAMP = ["#B5562E", "#D9A93A", "#C9C46A", "#7A9A3F", "#3F6B35"] as const;

/** Firma visual: pendiente = punteado trigo; sincronizado = sólido soja (RF-33). */
export const SYNC_BORDER = {
  pending: { color: BRAND.trigo, style: "dashed" },
  synced: { color: BRAND.soja, style: "solid" },
} as const;

export const MIN_TOUCH_TARGET_PX = 56;
