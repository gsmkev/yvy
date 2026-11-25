/** Renglones de la compra nueva: borrador, validación y total. */
import { lineAmount, t, toMinor, type Currency } from "@yvy/shared";
import { parseDecimal } from "../format";

/** Renglón de la compra como texto, tal cual lo escribe la persona. */
export interface LineDraft {
  productId: string;
  description: string;
  qty: string;
  price: string;
}

/** Renglón listo para mandar a la API. */
export interface LineBody {
  productId: string | null;
  description: string | null;
  category: string | null;
  qty: number;
  unitPrice: number;
}

/** Renglón vacío. */
export const blankLine = (): LineDraft => ({ productId: "", description: "", qty: "", price: "" });

/** Valida un renglón: devuelve el cuerpo para la API o el texto del error. */
function lineBody(l: LineDraft, currency: Currency): LineBody | { error: string } {
  const qty = parseDecimal(l.qty);
  const price = parseDecimal(l.price);
  if (qty === null || qty <= 0) return { error: t("office.adm.badQty") };
  if (price === null || price < 0) return { error: t("office.adm.badPrice") };
  if (!l.productId && !l.description.trim()) return { error: t("office.adm.needsLineProduct") };
  return { productId: l.productId || null, description: l.productId ? null : l.description.trim(), category: l.productId ? null : "other", qty, unitPrice: toMinor(price, currency) };
}

/** Valida todos los renglones; se detiene en el primer error. */
export function linesBody(lines: LineDraft[], currency: Currency): LineBody[] | { error: string } {
  const out: LineBody[] = [];
  for (const l of lines) {
    const b = lineBody(l, currency);
    if ("error" in b) return b;
    out.push(b);
  }
  return out;
}

/** Total de la compra en la moneda elegida (lo que alcanzó a escribirse vale; lo vacío cuenta cero). */
export const linesTotal = (lines: LineDraft[], currency: Currency): number => lines.reduce((a, l) => a + lineAmount(parseDecimal(l.qty) ?? 0, toMinor(parseDecimal(l.price) ?? 0, currency)), 0);
