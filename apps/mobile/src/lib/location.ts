/** GPS solo al anotar (PRD §7: sin seguimiento continuo). */
import * as Location from "expo-location";
import { containsPoint, type Area } from "@yvy/geo";
import { t } from "@yvy/shared";
import type { Plot } from "../db/store";

export interface Fix {
  lon: number;
  lat: number;
  accuracy: number | null;
}

/** El GPS a veces informa 0 o nada (emuladores, algunos equipos): eso no es "exacto", es "sin dato". */
export const hasAccuracy = (a: number | null | undefined): a is number => typeof a === "number" && Number.isFinite(a) && a > 0;

/** Texto de precisión para mostrar: "Ubicación ± 8 m" o "Ubicación sin precisión". */
export const accuracyLabel = (a: number | null | undefined): string =>
  hasAccuracy(a) ? t("app.gpsOk", { m: Math.round(a) }) : t("app.gpsNoAccuracy");

const cleanAccuracy = (a: number | null | undefined): number | null => (hasAccuracy(a) ? a : null);

export async function currentFix(timeoutMs = 12_000): Promise<Fix | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== "granted") return null;
  try {
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (pos) return { lon: pos.coords.longitude, lat: pos.coords.latitude, accuracy: cleanAccuracy(pos.coords.accuracy) };
    const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
    return last ? { lon: last.coords.longitude, lat: last.coords.latitude, accuracy: cleanAccuracy(last.coords.accuracy) } : null;
  } catch {
    return null;
  }
}

const M_PER_DEG_LAT = 111_320;

/** Distancia aproximada (m) de un punto al borde de un bbox; 0 si está adentro. Alcanza para decidir si preguntar. */
function metersToBboxEdge(p: Plot, lon: number, lat: number): number {
  const mLon = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const dx = Math.max(p.minLon - lon, 0, lon - p.maxLon) * mLon;
  const dy = Math.max(p.minLat - lat, 0, lat - p.maxLat) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

export interface PlotGuess {
  plot: Plot;
  /** "sure": adentro y lejos del borde. "near": adentro pero el error del GPS llega al borde, o a menos de 50 m afuera. */
  confidence: "sure" | "near";
}

/**
 * Lotes candidatos para la posición actual, mejores primero (RF-31).
 * Devuelve varios cuando el punto cae en lotes superpuestos o cerca de un límite.
 */
export function guessPlots(plots: Plot[], fix: Fix | null): PlotGuess[] {
  if (!fix) return [];
  const err = hasAccuracy(fix.accuracy) ? fix.accuracy : 30;
  const out: PlotGuess[] = [];
  for (const p of plots) {
    const geometry = JSON.parse(p.geometry) as Area;
    const inside = containsPoint(geometry, fix.lon, fix.lat);
    if (inside) {
      // Si el error del GPS supera la distancia al borde interior, no estamos seguros.
      const insideMargin = Math.min(
        (fix.lon - p.minLon) * M_PER_DEG_LAT * Math.cos((fix.lat * Math.PI) / 180),
        (p.maxLon - fix.lon) * M_PER_DEG_LAT * Math.cos((fix.lat * Math.PI) / 180),
        (fix.lat - p.minLat) * M_PER_DEG_LAT,
        (p.maxLat - fix.lat) * M_PER_DEG_LAT,
      );
      // Sin precisión informada no se puede afirmar que estamos adentro con seguridad.
      out.push({ plot: p, confidence: hasAccuracy(fix.accuracy) && insideMargin > err ? "sure" : "near" });
    } else if (metersToBboxEdge(p, fix.lon, fix.lat) <= Math.max(50, err)) {
      out.push({ plot: p, confidence: "near" });
    }
  }
  return out.sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === "sure" ? -1 : 1));
}

/** Compatibilidad: el mejor candidato seguro, o null. */
export const detectPlot = (plots: Plot[], fix: Fix | null): Plot | null => guessPlots(plots, fix).find((g) => g.confidence === "sure")?.plot ?? null;
