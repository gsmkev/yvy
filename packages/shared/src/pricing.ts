/** Precio público: US$ por hectárea y año, escalones de ganadería, mínimo y forma de pago. */
import { LIMITS } from "./limits";

/** Formas de pago: mensual, por ciclo (cuotas) o anual. */
export const BILLINGS = ["monthly", "cycle", "annual"] as const;
/** Forma de pago. */
export type Billing = (typeof BILLINGS)[number];

const ok = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** US$ al año por `ha` de ganadería, con cada tramo a su precio. */
export function cattleYear(ha: number): number {
  let left = ok(ha);
  let from = 0;
  let total = 0;
  for (const tier of LIMITS.pricing.cattleTiers) {
    const size = tier.upToHa === null ? left : Math.min(left, tier.upToHa - from);
    total += size * tier.haYear;
    left -= size;
    from = tier.upToHa ?? from;
    if (left <= 0) break;
  }
  return total;
}

/** Precio de un año para las hectáreas de agricultura y de ganadería: total, por cuota, por hectárea y si se aplicó el mínimo mensual. */
export function priceFor(cropsHa: number, cattleHa: number, billing: Billing = "monthly") {
  const P = LIMITS.pricing;
  const raw = ok(cropsHa) * P.cropsHaYear + cattleYear(cattleHa);
  const minApplied = raw / 12 < P.minMonth;
  const base = minApplied ? P.minMonth * 12 : raw;
  const year = billing === "annual" ? (base / 12) * P.annualMonths : base;
  const installments = billing === "monthly" ? 12 : billing === "cycle" ? P.cycleInstallments : 1;
  const ha = ok(cropsHa) + ok(cattleHa);
  return {
    year,
    perInstallment: year / installments,
    installments,
    perHa: ha > 0 ? year / ha : 0,
    minApplied,
  };
}

/** Guaraníes redondeados (sin decimales) de un monto en dólares. */
export const usdToGs = (usd: number, rate: number = LIMITS.pricing.usdToPyg) => Math.round(usd * rate);
