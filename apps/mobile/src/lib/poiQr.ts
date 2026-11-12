/** Anotar en un punto de interés escaneando su QR (F-28). */
import type { RecordKind } from "@yvy/shared";
import type { Poi } from "../db/store";

/**
 * Qué se anota de entrada según el tipo de punto: en el pluviómetro, lluvia; en la aguada, el bebedero o el molino, su nivel.
 * Con los demás (silo, corral, tranquera…) se pregunta qué anotar.
 */
export function kindForPoi(poiKind: Poi["kind"]): RecordKind | null {
  switch (poiKind) {
    case "rain_gauge":
      return "rain";
    case "water":
    case "trough":
    case "mill":
      return "water";
    default:
      return null;
  }
}
