/**
 * R-08: comparación anónima con la zona. Por estancia, la mediana de vigor (NDVI) y lluvia de las estancias de OTRAS
 * organizaciones dentro de LIMITS.benchmark.radiusKm, solo si son al menos `minFarms` de `minOrgs` organizaciones
 * distintas. Corre en el cron semanal con acceso de sistema; el resultado guarda números y un conteo, nunca ids,
 * nombres ni geometrías ajenas.
 */
import { LIMITS } from "@yvy/shared";
import type { SystemDb } from "../db/system";

export const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export const haversineKm = (lon1: number, lat1: number, lon2: number, lat2: number): number => {
  const r = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
};

export interface BenchFarm {
  id: string;
  organizationId: string;
  lon: number;
  lat: number;
}

export async function benchmarkJob(sys: SystemDb, farm: BenchFarm, now: number): Promise<"saved" | "cleared"> {
  const { radiusKm, minFarms, minOrgs, windowDays, maxNeighbors } = LIMITS.benchmark;
  // Caja que contiene el círculo (1° de latitud ≈ 111 km); el filtro exacto es la distancia
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.max(0.2, Math.cos((farm.lat * Math.PI) / 180)));
  const candidates = await sys.benchmarkCandidates(farm.organizationId, {
    minLon: farm.lon - dLon,
    maxLon: farm.lon + dLon,
    minLat: farm.lat - dLat,
    maxLat: farm.lat + dLat,
  });
  const near = candidates
    .map((c) => ({ ...c, km: haversineKm(farm.lon, farm.lat, c.lon, c.lat) }))
    .filter((c) => c.km <= radiusKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, maxNeighbors);
  if (near.length < minFarms || new Set(near.map((n) => n.organizationId)).size < minOrgs) {
    await sys.clearBenchmark(farm.id);
    return "cleared";
  }
  const since = now - windowDays * 86_400_000;
  const sinceDate = new Date(since).toISOString().slice(0, 10);
  const [own, theirs] = await Promise.all([
    sys.benchmarkMetrics([farm.id], since, sinceDate),
    sys.benchmarkMetrics(
      near.map((n) => n.id),
      since,
      sinceDate,
    ),
  ]);
  // Una medida solo se compara con al menos `minFarms` valores vecinos
  const med = (pick: "ndvi" | "rainMm") => {
    const v = [...theirs.values()].map((m) => m[pick]).filter((x): x is number => x !== null);
    return v.length >= minFarms ? median(v) : null;
  };
  const me = own.get(farm.id);
  await sys.saveBenchmark({
    farmId: farm.id,
    organizationId: farm.organizationId,
    computedAt: now,
    radiusKm,
    windowDays,
    nFarms: near.length,
    ndvi: me?.ndvi ?? null,
    ndviMedian: med("ndvi"),
    rainMm: me?.rainMm ?? null,
    rainMedianMm: med("rainMm"),
  });
  return "saved";
}
