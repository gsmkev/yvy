import { useQuery } from "@tanstack/react-query";
import { get } from "./api";

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

export const useManagementZones = (farmId: string) =>
  useQuery({
    queryKey: ["management-zones", farmId],
    queryFn: () => get<ManagementZone[]>(`/org/farms/${farmId}/management-zones`),
    staleTime: 10 * 60_000,
  });
