/**
 * Entregas de grano al acopio (A-23): peso neto después de los descuentos de balanza.
 * El acopio descuenta por humedad (lleva el grano a la humedad base), por impurezas y, a veces, otros conceptos.
 */
import type { CROPS } from "./schema";

type Crop = (typeof CROPS)[number];

/** Humedad base de recibo (%) de referencia por cultivo; cada ticket trae la suya y manda sobre esta. */
export const BASE_MOISTURE_PCT: Record<Crop, number> = {
  soja: 13,
  maiz: 14,
  trigo: 13,
  arroz: 13,
  girasol: 11,
  chia: 9,
  otro: 13,
};

export interface GrainTicket {
  grossKg: number;
  moisturePct: number | null;
  baseMoisturePct: number;
  /** Descuento por impurezas, en % del peso. */
  impuritiesPct: number;
  /** Otros descuentos en kilos (secado, vales). */
  otherKg: number;
}

export interface GrainNet {
  /** Merma por humedad en kg (0 si la humedad no pasa la base). */
  moistureKg: number;
  impuritiesKg: number;
  otherKg: number;
  netKg: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Neto = bruto llevado a la humedad base, menos impurezas y otros descuentos. Con humedad bajo la base no se
 * suma peso (el acopio no paga la humedad que falta).
 */
export function grainNet(t: GrainTicket): GrainNet {
  const base = Math.min(Math.max(t.baseMoisturePct, 0), 99);
  const m = t.moisturePct ?? base;
  const afterMoisture = m > base ? (t.grossKg * (100 - m)) / (100 - base) : t.grossKg;
  const moistureKg = t.grossKg - afterMoisture;
  const impuritiesKg = (afterMoisture * t.impuritiesPct) / 100;
  const net = Math.max(0, afterMoisture - impuritiesKg - t.otherKg);
  return { moistureKg: r1(moistureKg), impuritiesKg: r1(impuritiesKg), otherKg: r1(t.otherKg), netKg: r1(net) };
}
