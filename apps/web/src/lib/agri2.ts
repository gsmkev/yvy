/** Tipos y consultas de la segunda tanda de agricultura (agri-p2). */
import { useQuery } from "@tanstack/react-query";
import type { PHENO_STAGES } from "@yvy/shared";
import { get } from "./api";

export interface Phenology {
  status: "ok" | "no_crop" | "no_reference" | "no_sowing_date" | "no_data";
  crop: string | null;
  sowingDate: string | null;
  sowingSource: "record" | "plot" | null;
  baseC: number | null;
  gdd: number | null;
  coverage: { days: number; of: number } | null;
  estimatedStage: (typeof PHENO_STAGES)[number] | null;
  next: { stage: (typeof PHENO_STAGES)[number]; gddLeft: number } | null;
  observed: { stage: (typeof PHENO_STAGES)[number]; condition: string; at: number } | null;
  comparison: "ahead" | "on_track" | "behind" | null;
}

export const usePhenology = (plotId: string, enabled = true) =>
  useQuery({
    enabled,
    queryKey: ["phenology", plotId],
    queryFn: () => get<Phenology>(`/org/plots/${plotId}/phenology`),
  });

export interface SowingWindowResponse {
  crop: string;
  soil: number | null;
  soilDate: string | null;
  forecastRunAt: number | null;
  days: { date: string; ok: boolean; reasons: ("rain_day" | "cold" | "dry" | "saturated")[]; rainAhead: boolean }[];
  best: { from: string; to: string } | null;
}

export const useSowingWindow = (farmId: string, crop: string) =>
  useQuery({
    queryKey: ["sowing-window", farmId, crop],
    queryFn: () => get<SowingWindowResponse>(`/org/farms/${farmId}/sowing-window?crop=${crop}`),
  });

export interface WaterBalance {
  status: "ok" | "no_crop" | "no_reference" | "no_sowing_date" | "no_data";
  crop: string | null;
  sowingDate: string | null;
  balance: {
    days: number;
    rainMm: number;
    etcMm: number;
    balanceMm: number;
    balance14Mm: number | null;
    risk: "low" | "medium" | "high" | null;
    series: { date: string; rainMm: number; etcMm: number; cumMm: number }[];
  } | null;
}

export const useWaterBalance = (plotId: string, enabled = true) =>
  useQuery({
    enabled,
    queryKey: ["water-balance", plotId],
    queryFn: () => get<WaterBalance>(`/org/plots/${plotId}/water-balance`),
  });

export interface WithdrawalResponse {
  today: string;
  restrictions: { plotId: string; plotName: string; safeFrom: string; daysLeft: number; product: string; appliedOn: string }[];
  violations: { plotId: string; plotName: string; harvestedOn: string; safeFrom: string; product: string; appliedOn: string }[];
  unknown: { plotId: string; plotName: string; product: string; appliedOn: string }[];
}

export const useWithdrawal = (farmId: string, enabled = true) =>
  useQuery({
    enabled,
    queryKey: ["withdrawal", farmId],
    queryFn: () => get<WithdrawalResponse>(`/org/farms/${farmId}/withdrawal`),
  });
