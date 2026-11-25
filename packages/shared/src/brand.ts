/** Tokens de marca: paleta, rampas de color, estilo de sincronización y colores de gráficos. */

/** Paleta de marca. */
export const BRAND = {
  lino: "#F1EEE4",
  surco: "#1E2419",
  soja: "#7A9A3F",
  trigo: "#D9A93A",
  cielo: "#8DB3C7",
  alerta: "#D2462B",
} as const;

/** Rampa de humedad (NDMI): trigo (seco) a cielo (húmedo). */
export const NDMI_RAMP = ["#D9A93A", "#F1EEE4", "#8DB3C7"] as const;
/** Rampa NDVI de bajo a alto vigor. */
export const NDVI_RAMP = ["#B5562E", "#D9A93A", "#C9C46A", "#7A9A3F", "#3F6B35"] as const;

/** Firma visual: pendiente = punteado trigo; sincronizado = sólido soja. */
export const SYNC_BORDER = {
  pending: { color: BRAND.trigo, style: "dashed" },
  synced: { color: BRAND.soja, style: "solid" },
} as const;

/** Tamaño mínimo (px) de un objetivo táctil. */
export const MIN_TOUCH_TARGET_PX = 56;

/** Colores de series de gráficos, validados (contraste y daltonismo) con la paleta de marca. */
export const CHART = {
  primary: "#7A9A3F", // soja: el lote / la serie principal
  comparison: "#8DB3C7", // cielo: promedio del campo, lluvia satelital, mínimas
  warm: "#B5562E", // máximas
  gauge: "#D9A93A", // trigo: pluviómetro
  grid: "#E4E0D3",
  axis: "#6B6F63",
  text: "#1E2419",
} as const;
