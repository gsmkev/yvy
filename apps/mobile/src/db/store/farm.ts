/** Estancias, lotes y puntos de interés, y lo satelital que baja al celular. */
import { newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { describeArea } from "@yvy/geo";
import type { Polygon } from "geojson";
import { type Farm, type Plot, type Poi, type Alert, type FarmLayer, type Ctx, enqueue, fromRow } from "./core";

/** Marca un punto de interés. Fila local + mutación en una sola transacción. */
export function savePoi(db: Ctx, orgId: string, input: { farmId: string; kind: Poi["kind"]; name: string; lon: number; lat: number }, poiId = newId()): string {
  const ts = db.now();
  const name = input.name.trim();
  db.sql.tx(() => {
    db.sql.run(
      `INSERT INTO points_of_interest (id, organization_id, farm_id, kind, name, lon, lat, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name, lon = excluded.lon, lat = excluded.lat, updated_at = excluded.updated_at`,
      [poiId, orgId, input.farmId, input.kind, name, input.lon, input.lat, ts, ts],
    );
    enqueue(db, { mutationId: newId(), kind: "pois.upsert", row: { id: poiId, farmId: input.farmId, kind: input.kind, name, lon: input.lon, lat: input.lat } }, poiId);
  });
  return poiId;
}

/**
 * Lote dibujado o editado en el celular. Fila local + mutación plots.upsert en una sola transacción.
 * Al editar solo cambian nombre, tipo, cultivo y forma: campaña, fecha de siembra y color quedan como estaban.
 */
export function savePlot(db: Ctx, 
  orgId: string,
  input: { id?: string; farmId: string; name: string; kind: Plot["kind"]; crop: Plot["crop"]; geometry: Polygon },
): string {
  const id = input.id ?? newId();
  const ts = db.now();
  const name = input.name.trim();
  const crop = input.kind === "crop" ? input.crop : null;
  const d = describeArea(input.geometry);
  db.sql.tx(() => {
    db.sql.run(
      `INSERT INTO plots (id, organization_id, farm_id, name, kind, geometry, min_lon, min_lat, max_lon, max_lat, area_ha, crop, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, crop = excluded.crop, geometry = excluded.geometry,
         min_lon = excluded.min_lon, min_lat = excluded.min_lat, max_lon = excluded.max_lon, max_lat = excluded.max_lat,
         area_ha = excluded.area_ha, updated_at = excluded.updated_at`,
      [id, orgId, input.farmId, name, input.kind, d.geometry, d.minLon, d.minLat, d.maxLon, d.maxLat, d.areaHa, crop, ts, ts],
    );
    enqueue(db,
      { mutationId: newId(), kind: "plots.upsert", row: { id, farmId: input.farmId, name, kind: input.kind, crop, geometry: input.geometry } },
      id,
    );
  });
  return id;
}

/** Estancias, por nombre. */
export function farms(db: Ctx): Farm[] {
  return db.sql
    .all("SELECT * FROM farms WHERE deleted_at IS NULL ORDER BY name")
    .map((r) => fromRow<Farm>(s.farms, r));
}

/** Lotes, de una estancia o de todas. */
export function plots(db: Ctx, farmId?: string): Plot[] {
  return db.sql
    .all(
      "SELECT * FROM plots WHERE deleted_at IS NULL" + (farmId ? " AND farm_id = ?" : "") + " ORDER BY name",
      farmId ? [farmId] : [],
    )
    .map((r) => fromRow<Plot>(s.plots, r));
}

/** Puntos de interés, de una estancia o de todas. */
export function pois(db: Ctx, farmId?: string): Poi[] {
  return db.sql
    .all(
      "SELECT * FROM points_of_interest WHERE deleted_at IS NULL" + (farmId ? " AND farm_id = ?" : ""),
      farmId ? [farmId] : [],
    )
    .map((r) => fromRow<Poi>(s.pointsOfInterest, r));
}

/** Último NDVI del lote según lo que bajó al celular; null si no hay (empleados no reciben estadísticas). */
export function lastVigor(db: Ctx, plotId: string): { mean: number; acquiredAt: number } | null {
  const r = db.sql.get<{ mean: number; acquired_at: number }>(
    "SELECT mean, acquired_at FROM plot_index_stats WHERE plot_id = ? AND idx = 'ndvi' AND deleted_at IS NULL ORDER BY acquired_at DESC LIMIT 1",
    [plotId],
  );
  return r ? { mean: r.mean, acquiredAt: r.acquired_at } : null;
}

/** Las dos últimas pasadas de NDVI de cada lote, para ver cuáles empeoraron. */
export function lastTwoVigorPasses(db: Ctx): { plotId: string; mean: number; acquiredAt: number }[] {
  return db.sql
    .all<{ plot_id: string; mean: number; acquired_at: number }>(
      `SELECT plot_id, mean, acquired_at FROM (
         SELECT plot_id, mean, acquired_at,
                ROW_NUMBER() OVER (PARTITION BY plot_id ORDER BY acquired_at DESC) AS rn
         FROM plot_index_stats WHERE idx = 'ndvi' AND deleted_at IS NULL
       ) WHERE rn <= 2`,
    )
    .map((r) => ({ plotId: r.plot_id, mean: r.mean, acquiredAt: r.acquired_at }));
}

/** Avisos activos. */
export function activeAlerts(db: Ctx): Alert[] {
  return db.sql
    .all(
      "SELECT * FROM alerts WHERE resolved_at IS NULL AND (valid_to IS NULL OR valid_to >= ?) ORDER BY valid_from",
      [db.now()],
    )
    .map((r) => fromRow<Alert>(s.alerts, r));
}

/** Última capa de cada tipo de una estancia. */
export function latestLayers(db: Ctx, farmId: string): FarmLayer[] {
  return db.sql
    .all(
      `SELECT l.* FROM farm_layers l WHERE l.farm_id = ? AND l.deleted_at IS NULL AND l.layer IN ('true_color', 'ndvi')
       AND l.acquired_at = (SELECT max(acquired_at) FROM farm_layers x WHERE x.farm_id = l.farm_id AND x.layer = l.layer AND x.deleted_at IS NULL)`,
      [farmId],
    )
    .map((r) => fromRow<FarmLayer>(s.farmLayers, r));
}
