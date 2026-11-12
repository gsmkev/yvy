import type { Plot } from "./types";

export type SortKey = "name" | "kind" | "area" | "vigor" | "visit";
export type SortDir = "asc" | "desc";

const collator = new Intl.Collator("es-PY", { sensitivity: "base", numeric: true });

/** Tipo para ordenar: cultivos por nombre de cultivo y potreros al final. */
export const kindOf = (p: Plot) => (p.kind === "pasture" ? "~potrero" : (p.crop ?? "~cultivo"));

const value = (p: Plot, k: SortKey): string | number | null => {
  switch (k) {
    case "name":
      return p.name;
    case "kind":
      return kindOf(p);
    case "area":
      return p.areaHa;
    case "vigor":
      return p.ndviMean;
    case "visit":
      return p.lastRecordAt;
  }
};

/** Ordena sin mutar. Los lotes sin dato (sin pasada o sin visita) quedan siempre al final. */
export function sortPlots(plots: Plot[], key: SortKey, dir: SortDir): Plot[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...plots].sort((a, b) => {
    const x = value(a, key);
    const y = value(b, key);
    if (x === null && y === null) return collator.compare(a.name, b.name);
    if (x === null) return 1;
    if (y === null) return -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(x), String(y));
    return c === 0 ? collator.compare(a.name, b.name) : c * sign;
  });
}

/** Sentido inicial al elegir una columna: lo importante primero (más vigor, más reciente, más grande). */
export const defaultDir = (k: SortKey): SortDir => (k === "name" || k === "kind" ? "asc" : "desc");
