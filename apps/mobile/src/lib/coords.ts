import { t } from "@yvy/shared";

/** "-25.28123, -57.63456 · ± 8 m", o "… · sin precisión" si el GPS no informó. */
export function formatFix(fix: { lat: number; lon: number; accuracy: number | null }): string {
  const coords = `${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}`;
  return fix.accuracy !== null && Number.isFinite(fix.accuracy) && fix.accuracy > 0
    ? t("app.coordsAccuracy", { coords, m: Math.round(fix.accuracy) })
    : t("app.coordsNoAccuracy", { coords });
}

/** Solo las coordenadas, para copiar. */
export const fixCoords = (fix: { lat: number; lon: number }): string => `${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}`;
