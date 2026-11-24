/** Consulta de las zonas de manejo calculadas por estancia. */
import { useQuery } from "@tanstack/react-query";
import { get } from "./api";

/** Zona de manejo de un lote con su superficie, NDVI medio y geometría en GeoJSON texto. */
export interface ManagementZone {
  plotId: string;
  zone: 1 | 2 | 3;
  areaHa: number;
  pct: number;
  meanNdvi: number;
  seasons: string;
  geometry: string;
  computedAt: number;
}

/** Zonas de manejo de todos los lotes de una estancia. */
export const useManagementZones = (farmId: string) =>
  useQuery({
    queryKey: ["management-zones", farmId],
    queryFn: () => get<ManagementZone[]>(`/org/farms/${farmId}/management-zones`),
    staleTime: 10 * 60_000,
  });
