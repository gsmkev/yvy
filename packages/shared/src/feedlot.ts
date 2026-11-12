/**
 * Feedlot (G-33): raciones de ingredientes del catálogo (% de la materia seca), suministro diario por corral y
 * conversión alimenticia (kg de materia seca por kg de peso ganado, con las pesadas del corral).
 * Los kilos de cada ingrediente salen de la materia seca suministrada: kg tal cual = kg MS x % de la ración / MS del producto.
 */
import { z } from "zod";
import { LIMITS } from "./limits";

const uuid = z.string().uuid();

export const rationItemSchema = z.object({
  productId: uuid,
  /** Parte de la materia seca de la ración, en %. */
  pctDm: z.number().min(0.1).max(100),
  /** Materia seca del producto tal como se guarda en el depósito, en % (maíz grano 88, silaje 35...). */
  dmPct: z.number().min(1).max(100).default(100),
});
export type RationItem = z.infer<typeof rationItemSchema>;

export const feedRationInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    items: z.array(rationItemSchema).min(1).max(LIMITS.feedlot.maxRationItems),
    note: z.string().trim().max(500).nullish(),
  })
  .refine((r) => new Set(r.items.map((i) => i.productId)).size === r.items.length, { message: "Un ingrediente está repetido" })
  .refine((r) => Math.abs(r.items.reduce((a, i) => a + i.pctDm, 0) - 100) <= LIMITS.feedlot.pctTolerance, {
    message: "Los porcentajes de materia seca tienen que sumar 100",
  });

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Suma de los % de materia seca de una ración. */
export const rationPctTotal = (items: Pick<RationItem, "pctDm">[]): number => round2(items.reduce((a, i) => a + i.pctDm, 0));

/** Kilos tal cual de cada ingrediente para `kgDm` kilos de materia seca de la ración. */
export function rationLines(items: RationItem[], kgDm: number): { productId: string; kg: number }[] {
  return items.map((i) => ({ productId: i.productId, kg: round2((kgDm * (i.pctDm / 100)) / (i.dmPct / 100)) })).filter((l) => l.kg > 0);
}

export interface FeedEntry {
  plotId: string;
  at: number;
  kgDm: number;
  kgAsFed: number;
}
export interface WeighingEntry {
  plotId: string;
  at: number;
  /** Peso promedio por cabeza. */
  kg: number;
  head: number | null;
}
export type CorralStatus = "ok" | "no_weighings" | "no_head" | "no_gain";
export interface CorralRow {
  plotId: string;
  /** Todo lo suministrado en el período. */
  feedKgDm: number;
  feedKgAsFed: number;
  feeds: number;
  status: CorralStatus;
  /** Entre la primera y la última pesada del período. */
  firstAt: number | null;
  lastAt: number | null;
  head: number | null;
  gainKg: number | null;
  /** Ganancia diaria por cabeza, en kg. */
  dailyGainKg: number | null;
  /** Materia seca suministrada entre las dos pesadas y kg de MS por kg ganado. */
  windowKgDm: number | null;
  conversion: number | null;
}

const DAY = 86_400_000;

/**
 * Resumen por corral. La conversión usa el alimento suministrado entre la primera y la última pesada del corral dentro
 * del período, y la ganancia es la diferencia de peso por cabeza por las cabezas de la última pesada. Sin dos pesadas
 * (con cabezas) o sin ganancia no hay conversión: no se inventa.
 */
export function corralReport(feeds: FeedEntry[], weighings: WeighingEntry[]): CorralRow[] {
  const plots = [...new Set([...feeds.map((f) => f.plotId), ...weighings.map((w) => w.plotId)])];
  return plots
    .map((plotId): CorralRow => {
      const fs = feeds.filter((f) => f.plotId === plotId);
      const ws = weighings.filter((w) => w.plotId === plotId).sort((a, b) => a.at - b.at);
      const base = {
        plotId,
        feedKgDm: round2(fs.reduce((a, f) => a + f.kgDm, 0)),
        feedKgAsFed: round2(fs.reduce((a, f) => a + f.kgAsFed, 0)),
        feeds: fs.length,
        firstAt: null as number | null,
        lastAt: null as number | null,
        head: null as number | null,
        gainKg: null as number | null,
        dailyGainKg: null as number | null,
        windowKgDm: null as number | null,
        conversion: null as number | null,
      };
      if (ws.length < 2) return { ...base, status: "no_weighings" };
      const first = ws[0]!;
      const last = ws[ws.length - 1]!;
      const head = last.head ?? first.head;
      if (!head || head <= 0) return { ...base, status: "no_head", firstAt: first.at, lastAt: last.at };
      const perHead = last.kg - first.kg;
      const gainKg = round2(perHead * head);
      const windowKgDm = round2(fs.filter((f) => f.at >= first.at && f.at <= last.at).reduce((a, f) => a + f.kgDm, 0));
      const days = (last.at - first.at) / DAY;
      const ok = gainKg > 0 && windowKgDm > 0;
      return {
        ...base,
        status: ok ? "ok" : "no_gain",
        firstAt: first.at,
        lastAt: last.at,
        head,
        gainKg,
        dailyGainKg: days > 0 ? round2(perHead / days) : null,
        windowKgDm,
        conversion: ok ? round2(windowKgDm / gainKg) : null,
      };
    })
    .sort((a, b) => b.feedKgDm - a.feedKgDm);
}
