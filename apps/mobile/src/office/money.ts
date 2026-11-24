/** Dinero en pantalla: guaraníes enteros y dólares con centavos. Copia mínima de apps/web/src/lib/money.ts, sin Intl. */
import { fromMinor, type Currency } from "@yvy/shared";
import { fmtNumber } from "./format";

const dots = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const group = (n: number) => dots(Math.round(Math.abs(n)).toString());

/** `minor` en la unidad menor: 1250000 PYG = "Gs. 1.250.000"; 12550 USD = "US$ 125,50". */
export function fmtMoney(minor: number, currency: Currency): string {
  if (currency === "PYG") return `${minor < 0 ? "-" : ""}Gs. ${group(minor)}`;
  const major = fromMinor(minor, "USD");
  const [int = "0", dec = "00"] = Math.abs(major).toFixed(2).split(".");
  return `${major < 0 ? "-" : ""}US$ ${dots(int)},${dec}`;
}

/** Guaraníes, para montos ya convertidos (costos, márgenes). */
export const fmtGs = (pyg: number) => fmtMoney(pyg, "PYG");

/** Cantidad con hasta 2 decimales y su unidad ("12,5 l"). */
export const fmtQty = (n: number, unit?: string) => `${fmtNumber(n, 2)}${unit ? ` ${unit}` : ""}`;
