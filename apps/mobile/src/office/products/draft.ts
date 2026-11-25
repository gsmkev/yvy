/** Borrador del formulario de producto: conversión desde y hacia el registro, validación y texto de la dosis. */
import { t } from "@yvy/shared";
import type { Product } from "../../db/store";
import { fmtNumber, parseDecimal } from "../format";

/** Rango de dosis habitual por hectárea de un producto (se guarda por REST, no se sincroniza). */
export interface DoseRange {
  productId: string;
  min: number | null;
  max: number | null;
}

/** Campos del formulario de producto como texto, tal cual los escribe la persona. */
export interface Draft {
  id: string | null;
  name: string;
  type: string;
  unit: string;
  ingredient: string;
  withdrawal: string;
  tox: string;
  doseMin: string;
  doseMax: string;
}

/** Cuerpo del producto y rango de dosis ya validados. */
export interface ParsedDraft {
  body: { name: string; type: string; unit: string; activeIngredient: string | null; withdrawalDays: number | null; toxClass: string | null };
  min: number | null;
  max: number | null;
}

const numText = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

/** Unidad de la dosis por hectárea según la unidad del producto. */
export const doseUnit = (u: string) => (u === "l" ? "l/ha" : "kg/ha");

/** Borrador para crear (sin producto) o editar un producto con su rango de dosis. */
export function draftOf(p: Product | null, r: DoseRange | undefined): Draft {
  return { id: p?.id ?? null, name: p?.name ?? "", type: p?.type ?? "agrochemical", unit: p?.unit ?? "l", ingredient: p?.activeIngredient ?? "", withdrawal: numText(p?.withdrawalDays), tox: p?.toxClass ?? "", doseMin: numText(r?.min), doseMax: numText(r?.max) };
}

/** Texto del rango de dosis de un producto, o null si no tiene. */
export function doseText(p: Product, r: DoseRange | undefined): string | null {
  if (!r || (r.min === null && r.max === null)) return null;
  const range = r.min !== null && r.max !== null ? `${fmtNumber(r.min, 2)} a ${fmtNumber(r.max, 2)}` : r.min !== null ? `${t("ui.review.atLeast")} ${fmtNumber(r.min, 2)}` : `${t("ui.review.upTo")} ${fmtNumber(r.max!, 2)}`;
  return t("ui.product.doseShown", { range, unit: doseUnit(p.unit) });
}

/** Un texto vacío es null; si no, su valor, que debe cumplir `ok` (si no, `undefined`). */
function optionalNumber(text: string, ok: (n: number) => boolean): number | null | undefined {
  if (!text.trim()) return null;
  const n = parseDecimal(text);
  return n !== null && ok(n) ? n : undefined;
}

/** Valida el borrador: devuelve el cuerpo y la dosis, o el texto del error que se le muestra a la persona. */
export function parseDraft(draft: Draft): ParsedDraft | { error: string } {
  const name = draft.name.trim();
  if (!name) return { error: t("office.product.needsName") };
  const wd = optionalNumber(draft.withdrawal, (n) => Number.isInteger(n) && n >= 0 && n <= 365);
  const min = optionalNumber(draft.doseMin, (n) => n >= 0);
  const max = optionalNumber(draft.doseMax, (n) => n >= 0);
  if (wd === undefined || min === undefined || max === undefined) return { error: t("office.season.badNumber") };
  if (min !== null && max !== null && min > max) return { error: t("office.product.doseOrder") };
  return { body: { name, type: draft.type, unit: draft.unit, activeIngredient: draft.ingredient.trim() || null, withdrawalDays: wd, toxClass: draft.tox.trim() || null }, min, max };
}
