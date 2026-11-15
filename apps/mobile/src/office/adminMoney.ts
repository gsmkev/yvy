/** Cifras de dinero para las tarjetas de Administración. */
import type { Currency } from "@yvy/shared";
import { fmtNumber } from "./format";

/** Cifra de una tarjeta, siempre con la moneda como unidad para que entre en una línea: "2.424 M" con "Gs.", "198.325" con "US$". */
export function compactMoney(minor: number, currency: Currency): { value: string; unit: string } {
  const major = currency === "PYG" ? minor : minor / 100;
  const unit = currency === "PYG" ? "Gs." : "US$";
  if (Math.abs(major) < 1_000_000) return { value: fmtNumber(major, currency === "PYG" || Math.abs(major) >= 10_000 ? 0 : 2), unit };
  const m = major / 1_000_000;
  return { value: `${fmtNumber(m, Math.abs(m) >= 1000 ? 0 : 1)} M`, unit };
}
