/**
 * Sistema visual de la app. Tres principios:
 * 1. El mapa es oscuro (satélite); todo lo demás es papel claro. Nunca mezclar.
 * 2. Una acción principal por pantalla, en verde acción. Lo demás es texto o borde.
 * 3. Los títulos llevan serif (Fraunces); el cuerpo, Inter. Los números grandes, Fraunces también.
 */
import { BRAND } from "@yvy/shared";

export const C = {
  ...BRAND,
  papel: "#FBFAF5",
  tinta: "#1E2419",
  tinta2: "#5B6054",
  tinta3: "#8C9186",
  linea: "#E3DFD2",
  lineaFuerte: "#C9C4B2",
  accion: "#4E6B24",
  accionOscuro: "#3B5219",
  accionSuave: "#E8EEDC",
  peligro: "#B5391F",
  peligroSuave: "#F6E3DE",
  atencion: "#7A5B0E",
  atencionSuave: "#F5EACB",
  blanco: "#FFFFFF",
} as const;

export const F = {
  serif: "Fraunces_600SemiBold",
  serifLight: "Fraunces_400Regular",
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemi: "Inter_600SemiBold",
} as const;

/** Escala tipográfica. Cuerpo mínimo 17 px: se usa al sol y con guantes. */
export const T = {
  display: { fontFamily: F.serif, fontSize: 34, lineHeight: 38, letterSpacing: -0.5, color: C.tinta },
  title: { fontFamily: F.serif, fontSize: 26, lineHeight: 30, letterSpacing: -0.3, color: C.tinta },
  heading: { fontFamily: F.sansSemi, fontSize: 19, lineHeight: 24, color: C.tinta },
  body: { fontFamily: F.sans, fontSize: 17, lineHeight: 24, color: C.tinta },
  bodyMedium: { fontFamily: F.sansMedium, fontSize: 17, lineHeight: 24, color: C.tinta },
  small: { fontFamily: F.sans, fontSize: 15, lineHeight: 20, color: C.tinta2 },
  smallMedium: { fontFamily: F.sansMedium, fontSize: 15, lineHeight: 20, color: C.tinta2 },
  number: { fontFamily: F.serif, fontSize: 56, lineHeight: 60, letterSpacing: -1, color: C.tinta },
} as const;

export const TOUCH = 56;
export const RADIUS = 12;
export const GUTTER = 20;
