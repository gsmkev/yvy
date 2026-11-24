/** Utilidades compartidas por las pantallas de anotación. */
import { t, type HerdCounts, type MessageKey, type RecordKind } from "@yvy/shared";
import type { Plot } from "../db/store";
import { getDb } from "../lib/db";
import { RAW } from "../lib/annotate";
import { seedCounts } from "../lib/counter";

/** Traduce una clave de texto; un texto con el prefijo de texto crudo se devuelve sin él. */
export const tr = (key: string, vars?: Record<string, string | number>) => (key.startsWith(RAW) ? key.slice(RAW.length) : t(key as MessageKey, vars));

/** Con más lotes que esto, la lista tiene buscador. */
export const SEARCH_FROM = 8;
/** Pasa a minúsculas y quita acentos, para buscar sin distinguirlos. */
export const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Pantalla actual del asistente de anotación. */
export type Phase = { name: "plot" } | { name: "multi" } | { name: "kind" } | { name: "mode" } | { name: "stationsCrop" } | { name: "stations" } | { name: "step"; i: number } | { name: "photo" } | { name: "done"; recordId: string };

/** Un conteo nuevo parte de lo que se calcula para el potrero: se corrige lo que cambió. */
export function seedFor(kind: RecordKind | null, plot: Plot | null, editing: unknown): HerdCounts {
  if (kind !== "herd_count" || !plot || editing) return {};
  const stock = getDb().herdStock(plot.id);
  return stock ? seedCounts(stock.counts) : {};
}

/** Subtítulo de un lote en la lista: cuánto hace de su última visita. */
export function plotSubtitle(p: Plot) {
  const last = getDb().lastVisitByPlot().get(p.id);
  if (!last) return t("app.no.visits");
  const days = Math.floor((Date.now() - last) / 86_400_000);
  return days === 0 ? t("app.last.visitToday") : days === 1 ? t("app.last.visitYesterday") : t("app.last.visit", { days });
}
