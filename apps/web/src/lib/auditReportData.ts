/**
 * R-05: datos del informe de auditoría para certificaciones (soja responsable, buenas prácticas).
 * Cruza cada aplicación con el catálogo de productos (principio activo, clase tóxica, carencia), el lote, el operador
 * y la distancia a aguadas y viviendas, y marca los casos que un auditor miraría: cosecha dentro del período de
 * carencia, producto sin carencia cargada, aplicación sin ubicación, cerca de agua o vivienda, viento fuera de rango.
 */
import { LIMITS } from "@yvy/shared";
import type { Poi, Product, RecordRow } from "./types";

/** Distancia (m) mínima a una aguada o vivienda por debajo de la cual se avisa (zona de amortiguación). */
export const BUFFER_M = 30;
const DAY = 86_400_000;

export type AuditFlag = "no_location" | "near_water_or_house" | "no_withdrawal" | "wind" | "harvest_in_withdrawal";

export interface AuditProduct {
  name: string;
  activeIngredient: string | null;
  toxClass: string | null;
  dose: number;
  unit: string;
  withdrawalDays: number | null;
}

export interface AuditApplication {
  id: string;
  at: number;
  plotName: string | null;
  plotId: string | null;
  operator: string | null;
  machine: string | null;
  areaHa: number | null;
  windKmh: number | null;
  products: AuditProduct[];
  /** Fecha desde la que se puede cosechar (la carencia más larga entre sus productos); null si no hay carencia cargada. */
  safeHarvestAt: number | null;
  /** Distancia a la aguada o vivienda más cercana, en metros; null sin ubicación o sin puntos. */
  nearestM: number | null;
  nearestName: string | null;
  flags: AuditFlag[];
}

export interface AuditReportData {
  from: string;
  to: string;
  applications: AuditApplication[];
  operators: { name: string; applications: number }[];
  totalHa: number;
  flagged: number;
}

/** Distancia en metros entre dos puntos (haversine). */
export function distanceM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function buildAuditReport(input: {
  from: string;
  to: string;
  applications: RecordRow[];
  harvests: RecordRow[];
  products: Product[];
  pois: Poi[];
}): AuditReportData {
  const byId = new Map(input.products.map((p) => [p.id, p]));
  const byName = new Map(input.products.map((p) => [p.name.toLowerCase(), p]));
  const sensitive = input.pois.filter((p) => p.kind === "water" || p.kind === "house");
  const harvestsByPlot = new Map<string, number[]>();
  for (const h of input.harvests) if (h.plotId) harvestsByPlot.set(h.plotId, [...(harvestsByPlot.get(h.plotId) ?? []), h.capturedAt]);

  const applications: AuditApplication[] = [...input.applications]
    .sort((a, b) => a.capturedAt - b.capturedAt)
    .map((r) => {
      const d = r.data as {
        products?: { productId?: string; name: string; dose: number; unit: string }[];
        areaHa?: number;
        windKmh?: number;
        machine?: string;
      };
      const products: AuditProduct[] = (d.products ?? []).map((p) => {
        const cat = (p.productId && byId.get(p.productId)) || byName.get(p.name.toLowerCase());
        return {
          name: p.name,
          activeIngredient: cat?.activeIngredient ?? null,
          toxClass: cat?.toxClass ?? null,
          dose: p.dose,
          unit: p.unit,
          withdrawalDays: cat?.withdrawalDays ?? null,
        };
      });
      const days = products.map((p) => p.withdrawalDays).filter((x): x is number => x !== null);
      const safeHarvestAt = days.length ? r.capturedAt + Math.max(...days) * DAY : null;
      let nearestM: number | null = null;
      let nearestName: string | null = null;
      if (r.lon !== null && r.lat !== null)
        for (const p of sensitive) {
          const m = distanceM(r.lon, r.lat, p.lon, p.lat);
          if (nearestM === null || m < nearestM) {
            nearestM = m;
            nearestName = p.name;
          }
        }
      const flags: AuditFlag[] = [];
      if (r.lon === null || r.lat === null) flags.push("no_location");
      if (nearestM !== null && nearestM < BUFFER_M) flags.push("near_water_or_house");
      if (products.some((p) => p.withdrawalDays === null)) flags.push("no_withdrawal");
      if (d.windKmh !== undefined && (d.windKmh < LIMITS.spray.windMinKmh || d.windKmh > LIMITS.spray.windMaxKmh))
        flags.push("wind");
      if (
        safeHarvestAt !== null &&
        r.plotId &&
        (harvestsByPlot.get(r.plotId) ?? []).some((h) => h > r.capturedAt && h < safeHarvestAt)
      )
        flags.push("harvest_in_withdrawal");
      return {
        id: r.id,
        at: r.capturedAt,
        plotName: r.plotName,
        plotId: r.plotId,
        operator: r.authorName,
        machine: d.machine ?? null,
        areaHa: d.areaHa ?? null,
        windKmh: d.windKmh ?? null,
        products,
        safeHarvestAt,
        nearestM: nearestM === null ? null : Math.round(nearestM),
        nearestName,
        flags,
      };
    });
  const ops = new Map<string, number>();
  for (const a of applications) ops.set(a.operator ?? "—", (ops.get(a.operator ?? "—") ?? 0) + 1);
  return {
    from: input.from,
    to: input.to,
    applications,
    operators: [...ops].map(([name, n]) => ({ name, applications: n })).sort((a, b) => b.applications - a.applications),
    totalHa: Math.round(applications.reduce((a, x) => a + (x.areaHa ?? 0), 0) * 10) / 10,
    flagged: applications.filter((a) => a.flags.length).length,
  };
}
