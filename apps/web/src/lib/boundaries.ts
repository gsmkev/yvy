/**
 * M-16: límites de departamentos (ADM1) y distritos (ADM2) de geoBoundaries (CC BY 4.0).
 * El job `boundaries` de workers-py los baja, los simplifica y los sube a R2 junto a las teselas;
 * la web los lee de ahí y, si todavía no existen, la capa queda como "no disponible" sin romper nada.
 */
import { useQuery } from "@tanstack/react-query";
import type { FeatureCollection } from "geojson";

export type BoundaryLevel = "adm1" | "adm2";
export const BOUNDARY_LEVELS: BoundaryLevel[] = ["adm1", "adm2"];

export const boundaryUrl = (tilesBaseUrl: string | undefined, level: BoundaryLevel): string | null =>
  tilesBaseUrl ? `${tilesBaseUrl.replace(/\/$/, "")}/boundaries/pry-${level}.geojson` : null;

/** Solo acepta una colección de polígonos con nombre; cualquier otra cosa (página de error, JSON vacío) es "no disponible". */
export function parseBoundaries(json: unknown): FeatureCollection | null {
  const fc = json as FeatureCollection | null;
  if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features) || fc.features.length === 0) return null;
  const ok = fc.features.every(
    (f) =>
      f?.geometry &&
      (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon") &&
      typeof f.properties?.name === "string",
  );
  return ok ? fc : null;
}

export async function fetchBoundaries(url: string): Promise<FeatureCollection | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return parseBoundaries(await res.json());
  } catch {
    return null;
  }
}

export const useBoundaries = (level: BoundaryLevel | null, tilesBaseUrl: string | undefined) => {
  const url = level ? boundaryUrl(tilesBaseUrl, level) : null;
  return useQuery({
    queryKey: ["boundaries", url],
    queryFn: () => fetchBoundaries(url!),
    enabled: !!url,
    staleTime: Infinity,
    retry: false,
  });
};
