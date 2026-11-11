/**
 * Vista del agrónomo (K-02): las estancias de todas las organizaciones donde la persona tiene acceso de oficina,
 * con sus avisos activos. Cada organización se lee con su propio ScopedDb (el rol real de esa membresía), así que
 * lo que se ve es exactamente lo que se vería al cambiar de organización.
 */
import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { membershipsOf } from "../auth/session";
import type { DB } from "./client";
import { farmSummaries } from "./queries";
import { ScopedDb } from "./scoped";

/** Tope de organizaciones por pedido: 2 consultas por organización, y D1 permite 50 por invocación. */
export const MAX_CLIENT_ORGS = 15;

export async function clientsOverview(
  db: DB,
  userId: string,
  opts: { onlyOrgId?: string; now?: number } = {},
) {
  const now = opts.now ?? Date.now();
  const memberships = (await membershipsOf(db, userId)).filter(
    (m) => m.role !== "worker" && (!opts.onlyOrgId || m.id === opts.onlyOrgId),
  );
  const orgs = memberships.slice(0, MAX_CLIENT_ORGS);
  const clients = await Promise.all(
    orgs.map(async (o) => {
      const sdb = new ScopedDb(db, { userId, orgId: o.id, role: o.role }, () => now);
      const [farms, alerts] = await Promise.all([
        farmSummaries(sdb),
        db
          .select({
            id: s.alerts.id,
            farmId: s.alerts.farmId,
            kind: s.alerts.kind,
            severity: s.alerts.severity,
            summary: s.alerts.summary,
          })
          .from(s.alerts)
          .where(
            and(
              eq(s.alerts.organizationId, o.id),
              isNull(s.alerts.resolvedAt),
              or(isNull(s.alerts.validTo), gte(s.alerts.validTo, now)),
            ),
          )
          .orderBy(desc(s.alerts.validFrom))
          .limit(50),
      ]);
      return {
        organization: { id: o.id, name: o.name, role: o.role },
        farms: farms.map((f) => ({
          id: f.id,
          name: f.name,
          department: f.department,
          areaHa: f.areaHa,
          centroidLon: f.centroidLon,
          centroidLat: f.centroidLat,
          minLon: f.minLon,
          minLat: f.minLat,
          maxLon: f.maxLon,
          maxLat: f.maxLat,
          activeAlerts: f.activeAlerts,
          lastRecordAt: f.lastRecordAt,
        })),
        alerts,
      };
    }),
  );
  return { clients, truncated: memberships.length > MAX_CLIENT_ORGS };
}
