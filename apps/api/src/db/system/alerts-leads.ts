/** Avisos, pedidos de informe (leads) y limpieza de códigos y sesiones vencidos. */
import { and, asc, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { LIMITS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { upsertAlert } from "../../jobs/alerts";
import { chunkForParams, runBatch } from "../client";
import type { SystemDb } from "./index";
import { bearing } from "./farms";

export async function fireAlert(sys: SystemDb, x: {
  farmId: string;
  date: string;
  severity: "watch" | "warning";
  minDistanceKm: number;
  windTowardsFarm?: boolean;
  hotspots: {
    lon: number;
    lat: number;
    acquiredAt: number;
    confidence: string | null;
    frp: number | null;
    source: string;
  }[];
}) {
  const [farm] = await sys.db
    .select({ id: s.farms.id, organizationId: s.farms.organizationId })
    .from(s.farms)
    .where(and(eq(s.farms.id, x.farmId), isNull(s.farms.deletedAt)))
    .limit(1);
  if (!farm) return null;
  if (x.hotspots.length) {
    await runBatch(
      sys.db,
      chunkForParams(x.hotspots, 7).map((chunk) =>
        sys.db
          .insert(s.fireHotspots)
          .values(
            chunk.map((h) => ({ ...h, id: `${h.source}:${h.acquiredAt}:${h.lon.toFixed(4)}:${h.lat.toFixed(4)}` })),
          )
          .onConflictDoNothing(),
      ),
    );
  }
  // RF-70: alto si el viento pronosticado sopla desde el foco hacia la estancia a > 25 km/h.
  let severity = x.severity;
  let windTowardsFarm = !!x.windTowardsFarm;
  const [wind] = await sys.db
    .select({
      kmh: s.forecasts.windKmh,
      dir: s.forecasts.windDirDeg,
      lon: s.farms.centroidLon,
      lat: s.farms.centroidLat,
    })
    .from(s.forecasts)
    .innerJoin(s.farms, eq(s.farms.id, s.forecasts.farmId))
    .where(and(eq(s.forecasts.farmId, x.farmId), eq(s.forecasts.validDate, x.date)))
    .orderBy(desc(s.forecasts.runAt))
    .limit(1);
  if (wind?.kmh && wind.dir !== null && wind.kmh > 25 && x.hotspots.length) {
    const h = x.hotspots[0]!;
    // El viento "viene de" wind.dir: sopla hacia la estancia si el foco está en esa dirección.
    const toHotspot = bearing(wind.lon, wind.lat, h.lon, h.lat);
    const diff = Math.abs(((toHotspot - wind.dir + 540) % 360) - 180);
    if (diff <= 45) {
      windTowardsFarm = true;
      severity = "warning";
    }
  }
  return upsertAlert(sys.db, farm, {
    kind: "fire",
    severity,
    probability: null,
    validFrom: x.date,
    validTo: x.date,
    summary: `Foco de calor a ${x.minDistanceKm.toFixed(1).replace(".", ",")} km de la estancia${windTowardsFarm ? ", con viento hacia el campo" : ""}`,
    details: { minDistanceKm: x.minDistanceKm, windTowardsFarm, hotspots: x.hotspots.length },
  });
}

/** Mantenimiento diario: borra códigos y tokens vencidos. */
/** V-04: pedidos del informe gratis que esperan al job (sin enviar, con intentos disponibles, de los últimos 30 días). */
export function pendingLeads(sys: SystemDb, now: number) {
  return sys.db
    .select({ id: s.leads.id, lon: s.leads.lon, lat: s.leads.lat })
    .from(s.leads)
    .where(
      and(isNull(s.leads.sentAt), lt(s.leads.attempts, LIMITS.leads.maxAttempts), gte(s.leads.createdAt, now - 30 * 86_400_000)),
    )
    .orderBy(asc(s.leads.createdAt))
    .limit(LIMITS.leads.jobBatch);
}

/** V-04: guarda el informe del pedido y cuenta el intento. Devuelve el email, o null si no existe o ya se envió. */
export async function saveLeadReport(sys: SystemDb, id: string, report: string, now: number): Promise<{ email: string } | null> {
  const [row] = await sys.db
    .update(s.leads)
    .set({ report, reportAt: now, status: "ready", attempts: sql`${s.leads.attempts} + 1` })
    .where(and(eq(s.leads.id, id), isNull(s.leads.sentAt)))
    .returning({ email: s.leads.email });
  return row ?? null;
}

export async function markLeadSent(sys: SystemDb, id: string, now: number): Promise<void> {
  await sys.db.update(s.leads).set({ status: "sent", sentAt: now }).where(eq(s.leads.id, id));
}

export async function purgeExpiredAuth(sys: SystemDb, now = Date.now()): Promise<void> {
  await runBatch(sys.db, [
    // V-04: el email del pedido y su informe no se guardan más allá de la retención
    sys.db.delete(s.leads).where(lt(s.leads.createdAt, now - LIMITS.leads.retentionMs)),
    // El teléfono del pedido de prueba tampoco se guarda más allá de su retención
    sys.db.delete(s.trialRequests).where(lt(s.trialRequests.createdAt, now - LIMITS.trialRequests.retentionMs)),
    sys.db.delete(s.emailCodes).where(lt(s.emailCodes.expiresAt, now)),
    sys.db.delete(s.linkCodes).where(or(lt(s.linkCodes.expiresAt, now), sql`${s.linkCodes.usedAt} IS NOT NULL`)),
    sys.db
      .delete(s.refreshTokens)
      .where(
        or(
          lt(s.refreshTokens.expiresAt, now),
          and(sql`${s.refreshTokens.revokedAt} IS NOT NULL`, lt(s.refreshTokens.revokedAt, now - 86_400_000)),
        ),
      ),
  ]);
}
