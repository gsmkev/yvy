/** Precio público (PRD §16): US$ por hectárea al año, con mínimo mensual. */
export const PRICE = { cropsHaYear: 0.8, cattleHaYear: 0.3, minMonth: 40 } as const;

export function priceFor(cropsHa: number, cattleHa: number) {
  const ok = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  const rawYear = ok(cropsHa) * PRICE.cropsHaYear + ok(cattleHa) * PRICE.cattleHaYear;
  const minApplied = rawYear / 12 < PRICE.minMonth;
  const month = minApplied ? PRICE.minMonth : rawYear / 12;
  return { month, year: month * 12, minApplied };
}
