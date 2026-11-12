/** Etiquetas de lotes en el mapa (M-12): un punto garantizado adentro de cada lote, los más grandes primero. */
import { labelPoint, type Area } from "@yvy/geo";

export interface LabelablePlot {
  id: string;
  name: string;
  geometry: string;
  areaHa: number;
}

export interface PlotLabel {
  id: string;
  name: string;
  lon: number;
  lat: number;
}

/**
 * Son vistas nativas: con muchos lotes se rotulan solo los `max` más grandes (los chicos se confunden entre sí y
 * con el borde). El punto sale de `labelPoint`, que cae adentro aun en lotes en L o en U.
 */
export function plotLabels(plots: LabelablePlot[], max: number): PlotLabel[] {
  return [...plots]
    .sort((a, b) => b.areaHa - a.areaHa)
    .slice(0, max)
    .map((p) => ({ id: p.id, name: p.name, ...labelPoint(JSON.parse(p.geometry) as Area) }));
}

/** Destino de "Llevame ahí" para un lote: el mismo punto interior, no el centroide (que en un lote en L puede caer afuera). */
export const plotTarget = (geometry: string): { lon: number; lat: number } => labelPoint(JSON.parse(geometry) as Area);
