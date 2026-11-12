/** Rumbo del celular para girar el mapa (F-04). Funciones puras: el sensor entra por useHeading. */

/** Lleva cualquier ángulo a [0, 360). */
export const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** Diferencia más corta de `from` a `to`, en (-180, 180]. */
export function angleDelta(from: number, to: number): number {
  const d = norm360(to - from);
  return d > 180 ? d - 360 : d;
}

/**
 * Filtro pasa-bajos circular: la brújula salta unos grados por muestra y el mapa no debe temblar.
 * `alpha` 1 = sin filtro; menor = más suave. Cruza el 360 sin dar la vuelta larga.
 */
export function smoothHeading(prev: number | null, next: number, alpha = 0.3): number {
  if (prev === null) return norm360(next);
  return norm360(prev + angleDelta(prev, next) * alpha);
}

/** ¿Vale la pena mover la cámara? Ignora cambios menores al umbral para no gastar batería ni quitarle el pulso al mapa. */
export const shouldRotate = (current: number, target: number, thresholdDeg = 4): boolean =>
  Math.abs(angleDelta(current, target)) >= thresholdDeg;

/** Rumbo de la cámara para que "arriba" en pantalla sea hacia donde mira el celular. */
export const mapBearingFor = (heading: number): number => Math.round(norm360(heading)) % 360;
