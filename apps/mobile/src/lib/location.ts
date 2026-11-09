/** GPS solo al crear un registro (PRD §7: sin tracking continuo). */
import * as Location from "expo-location";
import { containsPoint, type Area } from "@yvy/geo";
import type { Plot } from "../db/store";

export interface Fix {
  lon: number;
  lat: number;
  accuracy: number | null;
}

export async function currentFix(timeoutMs = 15_000): Promise<Fix | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== "granted") return null;
  try {
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (pos) return { lon: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy };
    const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
    return last ? { lon: last.coords.longitude, lat: last.coords.latitude, accuracy: last.coords.accuracy } : null;
  } catch {
    return null;
  }
}

/** RF-31: el lote se detecta si el punto cae dentro de un lote asignado. */
export function detectPlot(plots: Plot[], fix: Fix | null): Plot | null {
  if (!fix) return null;
  return (
    plots.find(
      (p) =>
        fix.lon >= p.minLon &&
        fix.lon <= p.maxLon &&
        fix.lat >= p.minLat &&
        fix.lat <= p.maxLat &&
        containsPoint(JSON.parse(p.geometry) as Area, fix.lon, fix.lat),
    ) ?? null
  );
}
