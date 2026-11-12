/** Dinero en pantalla: guaraníes enteros y dólares con centavos (ADR 0004). Siempre cifras tabulares (clase `num`). */
import { fromMinor, type Currency } from "@yvy/shared";

const gs = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });

/** `minor` en la unidad menor de la moneda: 1250000 PYG = "Gs. 1.250.000"; 12550 USD = "US$ 125,50". */
export const fmtMoney = (minor: number, currency: Currency) =>
  currency === "PYG" ? `Gs. ${gs.format(minor)}` : `US$ ${usd.format(fromMinor(minor, "USD"))}`;

/** Guaraníes, para montos ya convertidos (costos, márgenes). */
export const fmtGs = (pyg: number) => fmtMoney(pyg, "PYG");

/** Cantidad con hasta 2 decimales y su unidad ("12,5 l"). */
export const fmtQty = (n: number, unit?: string) => `${qty.format(n)}${unit ? ` ${unit}` : ""}`;
