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
/** Rampa de humedad (NDMI, S-07): trigo (seco) a cielo (húmedo). */
export const NDMI_RAMP = ["#D9A93A", "#F1EEE4", "#8DB3C7"] as const;
export const NDVI_RAMP = ["#B5562E", "#D9A93A", "#C9C46A", "#7A9A3F", "#3F6B35"] as const;

/** Firma visual: pendiente = punteado trigo; sincronizado = sólido soja (RF-33). */
export const SYNC_BORDER = {
  pending: { color: BRAND.trigo, style: "dashed" },
  synced: { color: BRAND.soja, style: "solid" },
} as const;

export const MIN_TOUCH_TARGET_PX = 56;

/** Colores de series de gráficos, validados (contraste y daltonismo) con la paleta de marca. */
export const CHART = {
  primary: "#7A9A3F", // soja: el lote / la serie principal
  comparison: "#3B78B8", // azul: promedio del campo, lluvia satelital, mínimas
  warm: "#B5562E", // máximas
  gauge: "#D9A93A", // trigo: pluviómetro
  grid: "#E4E0D3",
  axis: "#6B6F63",
  text: "#1E2419",
} as const;
