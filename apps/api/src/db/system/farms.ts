/** Lecturas de estancias para ingest y crons: lista activa, resumen público, umbrales, geometría y focos de calor. */
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { addDays, DEFAULT_ALERT_SETTINGS, localDate, type AlertSettings } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { dayOfYear } from "../queries";
import type { SystemDb } from "./index";

const rad = (d: number) => (d * Math.PI) / 180;
/** Rumbo inicial de 1 a 2 en grados desde el norte. */
export function bearing(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Estancias activas de todas las organizaciones, con lo que necesitan los trabajos programados. */
export function activeFarms(sys: SystemDb) {
  return sys.db
    .select({
      id: s.farms.id,
      organizationId: s.farms.organizationId,
      name: s.farms.name,
      centroidLon: s.farms.centroidLon,
      centroidLat: s.farms.centroidLat,
      minLon: s.farms.minLon,
      minLat: s.farms.minLat,
      maxLon: s.farms.maxLon,
      maxLat: s.farms.maxLat,
      hasClimatology: sql<boolean>`EXISTS (SELECT 1 FROM climatology c WHERE c.farm_id = farms.id)`,
      /** Informe de riesgo calculado en los últimos 90 días; pasado ese tiempo se recalcula. */
      hasRisk: sql<boolean>`EXISTS (SELECT 1 FROM farm_risk r WHERE r.farm_id = farms.id AND r.computed_at > ${Date.now() - 90 * 86_400_000})`,
      /** Hay alguien del equipo con email a quien mandarle el parte semanal. */
      hasReportRecipient: sql<boolean>`EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = farms.organization_id AND m.role IN ('owner', 'admin') AND m.deleted_at IS NULL AND u.email IS NOT NULL)`,
      hasBasemap: sql<boolean>`EXISTS (SELECT 1 FROM farm_layers l WHERE l.farm_id = farms.id AND l.layer = 'true_color' AND l.deleted_at IS NULL)`,
    })
    .from(s.farms)
    .where(isNull(s.farms.deletedAt));
}

/**
 * Resumen público de una estancia para un enlace de solo lectura. Devuelve el motivo si el enlace no sirve.
 * No incluye registros, personas ni geometrías: solo lotes, superficie, vigor, lluvia y avisos.
 */
export async function sharedSummary(sys: SystemDb, tokenHash: string, now: number) {
  const [link] = await sys.db
    .select({
      farmId: s.shareLinks.farmId,
      expiresAt: s.shareLinks.expiresAt,
      revokedAt: s.shareLinks.revokedAt,
      name: s.farms.name,
      department: s.farms.department,
      areaHa: s.farms.areaHa,
    })
    .from(s.shareLinks)
    .innerJoin(s.farms, and(eq(s.farms.id, s.shareLinks.farmId), isNull(s.farms.deletedAt)))
    .where(eq(s.shareLinks.tokenHash, tokenHash))
    .limit(1);
  if (!link) return { error: "not_found" as const };
  if (link.revokedAt !== null) return { error: "revoked" as const };
  if (link.expiresAt <= now) return { error: "expired" as const };
  const farmId = link.farmId;
  const today = localDate(now);
  const from30 = addDays(today, -30);
  const [plots, rain, alerts] = await Promise.all([
    sys.db
      .select({
        name: s.plots.name,
        kind: s.plots.kind,
        crop: s.plots.crop,
        areaHa: s.plots.areaHa,
        ndvi: sql<number | null>`(SELECT mean FROM plot_index_stats i WHERE i.plot_id = plots.id AND i.idx = 'ndvi' ORDER BY i.acquired_at DESC LIMIT 1)`,
        ndviAt: sql<number | null>`(SELECT acquired_at FROM plot_index_stats i WHERE i.plot_id = plots.id AND i.idx = 'ndvi' ORDER BY i.acquired_at DESC LIMIT 1)`,
      })
      .from(s.plots)
      .where(and(eq(s.plots.farmId, farmId), isNull(s.plots.deletedAt)))
      .orderBy(s.plots.name)
      .limit(500),
    sys.db
      .select({ mm: sql<number | null>`sum(${s.climateDaily.precipMm})`, n: sql<number>`count(*)` })
      .from(s.climateDaily)
      .where(
        and(
          eq(s.climateDaily.farmId, farmId),
          eq(s.climateDaily.plotId, ""),
          inArray(s.climateDaily.source, ["chirps", "chirps_prelim"]),
          gte(s.climateDaily.date, from30),
        ),
      ),
    sys.db
      .select({
        kind: s.alerts.kind,
        severity: s.alerts.severity,
        summary: s.alerts.summary,
        validFrom: s.alerts.validFrom,
        validTo: s.alerts.validTo,
      })
      .from(s.alerts)
      .where(
        and(
          eq(s.alerts.farmId, farmId),
          isNull(s.alerts.resolvedAt),
          or(isNull(s.alerts.validTo), sql`${s.alerts.validTo} >= ${now}`),
        ),
      )
      .orderBy(desc(s.alerts.validFrom))
      .limit(50),
  ]);
  const doys = Array.from({ length: 30 }, (_, i) => dayOfYear(addDays(today, -i)));
  const clim = await sys.db
    .select({ mean: s.climatology.mean })
    .from(s.climatology)
    .where(
      and(eq(s.climatology.farmId, farmId), eq(s.climatology.plotId, ""), eq(s.climatology.variable, "precip"), inArray(s.climatology.dayOfYear, doys)),
    );
  const normal = clim.length ? clim.reduce((a, c) => a + (c.mean ?? 0), 0) : null;
  return {
    farm: { name: link.name, department: link.department, areaHa: link.areaHa, plotCount: plots.length },
    plots,
    rain30: { mm: rain[0] && rain[0].n >= 25 ? (rain[0].mm ?? 0) : null, normalMm: normal },
    alerts,
    generatedAt: now,
    expiresAt: link.expiresAt,
    today,
  };
}

/** Umbrales de avisos de la estancia; por defecto si no hay fila. */
export async function alertSettings(sys: SystemDb, farmId: string): Promise<AlertSettings> {
  const [row] = await sys.db
    .select()
    .from(s.farmAlertSettings)
    .where(eq(s.farmAlertSettings.farmId, farmId))
    .limit(1);
  return row
    ? {
        frostTminC: row.frostTminC,
        excessRainMm24h: row.excessRainMm24h,
        droughtDeficitPct: row.droughtDeficitPct,
      }
    : { ...DEFAULT_ALERT_SETTINGS };
}

/** Geometría de una estancia y sus lotes en GeoJSON. */
export function farmGeometry(sys: SystemDb, farmId: string) {
  return sys.db
    .select({
      farm: s.farms.geometry,
      plots: sql<string>`(SELECT json_group_array(json_object('id', id, 'kind', kind, 'crop', crop, 'geometry', json(geometry))) FROM plots WHERE farm_id = ${farmId} AND deleted_at IS NULL)`,
    })
    .from(s.farms)
    .where(eq(s.farms.id, farmId))
    .limit(1);
}

/** Análisis de suelo de la estancia con coordenadas (para interpolar mapas de fertilidad). */
export function soilPoints(sys: SystemDb, farmId: string) {
  return sys.db
    .select({
      lon: s.soilSamples.lon,
      lat: s.soilSamples.lat,
      sampledOn: s.soilSamples.sampledOn,
      ph: s.soilSamples.ph,
      pMgKg: s.soilSamples.pMgKg,
      kCmolKg: s.soilSamples.kCmolKg,
      omPct: s.soilSamples.omPct,
    })
    .from(s.soilSamples)
    .where(and(eq(s.soilSamples.farmId, farmId), isNull(s.soilSamples.deletedAt), isNotNull(s.soilSamples.lon), isNotNull(s.soilSamples.lat)))
    .limit(5000);
}

/** Focos de calor guardados cerca de la estancia (bbox + ~2 km) desde `since`. */
export async function farmHotspots(sys: SystemDb, farmId: string, since: number) {
  const [f] = await sys.db
    .select({ minLon: s.farms.minLon, minLat: s.farms.minLat, maxLon: s.farms.maxLon, maxLat: s.farms.maxLat })
    .from(s.farms)
    .where(and(eq(s.farms.id, farmId), isNull(s.farms.deletedAt)))
    .limit(1);
  if (!f) return null;
  const pad = 0.02;
  return sys.db
    .select({ lon: s.fireHotspots.lon, lat: s.fireHotspots.lat, acquiredAt: s.fireHotspots.acquiredAt, confidence: s.fireHotspots.confidence })
    .from(s.fireHotspots)
    .where(
      and(
        gte(s.fireHotspots.acquiredAt, since),
        gte(s.fireHotspots.lon, f.minLon - pad),
        lte(s.fireHotspots.lon, f.maxLon + pad),
        gte(s.fireHotspots.lat, f.minLat - pad),
        lte(s.fireHotspots.lat, f.maxLat + pad),
      ),
    )
    .orderBy(s.fireHotspots.acquiredAt)
    .limit(500);
}

/** Lluvia diaria de la estancia desde una fecha (CHIRPS final, o preliminar si la final todavía no salió). */
export async function farmPrecip(sys: SystemDb, farmId: string, from: string) {
  const rows = await sys.db
    .select({ date: s.climateDaily.date, source: s.climateDaily.source, mm: s.climateDaily.precipMm })
    .from(s.climateDaily)
    .where(
      and(
        eq(s.climateDaily.farmId, farmId),
        eq(s.climateDaily.plotId, ""),
        inArray(s.climateDaily.source, ["chirps", "chirps_prelim"]),
        gte(s.climateDaily.date, from),
      ),
    )
    .orderBy(asc(s.climateDaily.date))
    .limit(400);
  const byDate = new Map<string, { mm: number; final: boolean }>();
  for (const r of rows) {
    if (r.mm === null) continue;
    const cur = byDate.get(r.date);
    if (!cur || (r.source === "chirps" && !cur.final)) byDate.set(r.date, { mm: r.mm, final: r.source === "chirps" });
  }
  return [...byDate.entries()].map(([date, v]) => ({ date, mm: v.mm }));
}
