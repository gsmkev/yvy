/** Pluviómetros contra satélite y contra lo normal, por mes y por campaña (C-05, C-06). La cuenta está en @yvy/shared; acá solo el corte de los días en la zona de la estancia. */
import { gaugeTable as gaugeTableOf, type ClimateData, type GaugeRow } from "@yvy/shared";
import { dayToMs } from "./format";

export type GaugeClimate = Omit<ClimateData, "gauge"> & { gauge: { capturedAt: number; mm: number; poiId?: string | null }[] };

/** Filas por mes y total de campaña para un pluviómetro (`poiId`), o para la lluvia anotada sin pluviómetro (null). */
export const gaugeTable = (
  c: GaugeClimate,
  poiId: string | null,
  from: string,
  cutoff: string,
  tz: string,
): { months: GaugeRow[]; season: GaugeRow } => gaugeTableOf(c, poiId, from, cutoff, (day, end) => dayToMs(day, tz, end) ?? 0);
