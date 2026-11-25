/** Plan de cultivo de un lote en una campaña: borrador del formulario, texto de la fila y validación. */
import { isoToDisplay, t, type MessageKey } from "@yvy/shared";
import type { Plot } from "../../db/store";
import type { PlanLite } from "../../lib/plotInfo";
import { fmtNumber, parseDecimal } from "../format";

const k = (s: string) => s as MessageKey;

/** Campos del plan como texto, tal cual los escribe la persona. */
export interface PlanDraft {
  crop: string;
  variety: string;
  sowing: string;
  density: string;
  unit: string;
  target: string;
}

const numText = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

/** Resumen de una línea del plan de un lote (o el aviso de que todavía no tiene). */
export function planText(p: PlanLite | undefined): string {
  if (!p) return t("ui.season.planEmpty");
  const parts = [
    p.crop ? t(k(`fields.crop.${p.crop}`)) : null,
    p.variety,
    p.plannedSowingDate ? `${t("ui.season.plannedSowing")} ${isoToDisplay(p.plannedSowingDate)}` : null,
    p.sowingDensity !== null && p.densityUnit ? `${fmtNumber(p.sowingDensity, 1)} ${t(k(`fields.density.unit_${p.densityUnit}`))}` : null,
    p.targetYieldTHa !== null ? `${fmtNumber(p.targetYieldTHa, 1)} t/ha` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : t("ui.season.planEmpty");
}

/** Borrador inicial: el plan existente o, si no hay, el cultivo actual del lote. */
export function planDraftOf(p: PlanLite | undefined, plot: Plot): PlanDraft {
  return { crop: p?.crop ?? plot.crop ?? "", variety: p?.variety ?? "", sowing: p?.plannedSowingDate ?? "", density: numText(p?.sowingDensity), unit: p?.densityUnit ?? "kg_ha", target: numText(p?.targetYieldTHa) };
}

/** Número positivo opcional: vacío es null; inválido o no positivo es `undefined`. */
function positive(text: string): number | null | undefined {
  if (!text.trim()) return null;
  const n = parseDecimal(text);
  return n !== null && n > 0 ? n : undefined;
}

/** Cuerpo del PUT del plan, o el texto del error si algún número no sirve. */
export function planBody(d: PlanDraft): Record<string, unknown> | { error: string } {
  const density = positive(d.density);
  const target = positive(d.target);
  if (density === undefined || target === undefined) return { error: t("office.season.badNumber") };
  return { crop: d.crop || null, variety: d.variety.trim() || null, plannedSowingDate: d.sowing || null, sowingDensity: density, densityUnit: density !== null ? d.unit : null, targetYieldTHa: target };
}
