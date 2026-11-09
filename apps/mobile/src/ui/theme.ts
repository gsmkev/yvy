import { BRAND, MIN_TOUCH_TARGET_PX } from "@yvy/shared";

/** Mismos tokens que la web; contrastes AA verificados (ver apps/web/src/styles.css). */
export const C = {
  ...BRAND,
  white: "#FFFFFF",
  papel: "#FBFAF6",
  tinta2: "#545A4D",
  linea: "#D9D4C4",
  accion: "#4E6B24",
  peligro: "#B5391F",
  trigoTexto: "#7A5B0E",
  muted: "#545A4D",
  line: "#D9D4C4",
};
export const TOUCH = MIN_TOUCH_TARGET_PX;
export const MONO = { fontFamily: "monospace" } as const;
