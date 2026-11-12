/** Fechas de imagen disponibles de una estancia y elección para comparar (S-04). */
import type { Layer } from "./types";

type Kind = Layer["layer"];

/** Capas de un tipo, de la más nueva a la más vieja, una por fecha. */
export function layerDates(layers: Layer[], kind: Kind): Layer[] {
  const seen = new Set<number>();
  return layers
    .filter((l) => l.layer === kind)
    .sort((a, b) => b.acquiredAt - a.acquiredAt)
    .filter((l) => (seen.has(l.acquiredAt) ? false : (seen.add(l.acquiredAt), true)));
}

/** La capa elegida si existe; si no, la más nueva. */
export function pickLayer(layers: Layer[], kind: Kind, id?: string | null): Layer | undefined {
  const all = layerDates(layers, kind);
  return all.find((l) => l.id === id) ?? all[0];
}

/** Para comparar: izquierda = la anterior a la derecha, derecha = la más nueva. null si hay menos de dos fechas. */
export function defaultCompare(layers: Layer[], kind: Kind): { left: string; right: string } | null {
  const all = layerDates(layers, kind);
  return all.length < 2 ? null : { left: all[1]!.id, right: all[0]!.id };
}

export interface Camera {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

/** ¿Las cámaras difieren lo suficiente como para mover el mapa? (corta el rebote entre los dos mapas) */
export function cameraDiffers(a: Camera, b: Camera): boolean {
  return (
    Math.abs(a.center[0] - b.center[0]) > 1e-7 ||
    Math.abs(a.center[1] - b.center[1]) > 1e-7 ||
    Math.abs(a.zoom - b.zoom) > 1e-4 ||
    Math.abs(a.bearing - b.bearing) > 1e-3 ||
    Math.abs(a.pitch - b.pitch) > 1e-3
  );
}
