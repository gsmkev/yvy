/** Tipos del feedlot: raciones y reporte por corral. */
import type { RationItem } from "@yvy/shared";

/** Ración con sus ingredientes en porcentaje de materia seca. */
export interface Ration {
  id: string;
  name: string;
  note: string | null;
  items: RationItem[];
}
/** Resultado de un corral en el período del reporte. */
export interface Corral {
  plotId: string;
  plotName: string;
  feedKgDm: number;
  feedKgAsFed: number;
  feeds: number;
  status: "ok" | "no_weighings" | "no_head" | "no_gain";
  firstAt: number | null;
  lastAt: number | null;
  head: number | null;
  gainKg: number | null;
  dailyGainKg: number | null;
  windowKgDm: number | null;
  conversion: number | null;
}
