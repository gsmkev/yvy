/**
 * Grabador del perímetro caminado (M-04). El GPS se usa solo mientras la pantalla está abierta y la persona
 * lo pidió (primer plano, nada en segundo plano): PRD §7 prohíbe el seguimiento continuo.
 */
import * as Location from "expo-location";
import { filterFix, type TracePoint } from "@yvy/geo";

const M_PER_DEG_LAT = 111_320;

/** Suma el fijo a la traza si es bueno (precisión y distancia mínima); devuelve la misma traza si se descarta. */
export function appendFix(trace: TracePoint[], fix: TracePoint): TracePoint[] {
  return filterFix(trace[trace.length - 1], fix) ? [...trace, fix] : trace;
}

/** Largo recorrido en metros (aproximado, alcanza para mostrar el avance). */
export function traceLengthM(trace: TracePoint[]): number {
  let m = 0;
  for (let i = 1; i < trace.length; i++) {
    const a = trace[i - 1]!;
    const b = trace[i]!;
    const mLon = M_PER_DEG_LAT * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
    m += Math.hypot((b.lon - a.lon) * mLon, (b.lat - a.lat) * M_PER_DEG_LAT);
  }
  return m;
}

/** Empieza a escuchar el GPS. Devuelve "denied" si no hay permiso. `stop` deja de escuchar. */
export async function startWalk(onFix: (fix: TracePoint) => void): Promise<{ stop: () => void } | "denied"> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== "granted") return "denied";
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 2000 },
    (pos) => onFix({ lon: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy && pos.coords.accuracy > 0 ? pos.coords.accuracy : null }),
  );
  return { stop: () => sub.remove() };
}
