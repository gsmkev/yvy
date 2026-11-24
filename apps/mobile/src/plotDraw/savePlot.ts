import type { Polygon } from "geojson";
import type { CROPS, PLOT_KINDS } from "@yvy/shared";
import { containsPoint, type Area } from "@yvy/geo";
import type { Farm, Plot } from "../db/store";
import { getDb } from "../lib/db";
import { localChanged } from "../lib/sync";
import { toastSaved } from "../lib/toast";

/** Guarda el lote dibujado (nuevo o editado) en la base local y avisa que hay algo para mandar. */
export function savePlotDraft(a: {
  orgId: string;
  editing: Plot | undefined;
  farms: Farm[];
  fallbackFarm: Farm;
  polygon: Polygon;
  name: string;
  kind: (typeof PLOT_KINDS)[number];
  crop: (typeof CROPS)[number] | null;
}): void {
  const first = a.polygon.coordinates[0]![0]!;
  // La estancia que contiene el primer vértice; si no, la elegida
  const target = a.farms.find((f) => containsPoint(JSON.parse(f.geometry) as Area, first[0]!, first[1]!)) ?? a.fallbackFarm;
  getDb().savePlot(a.orgId, {
    id: a.editing?.id,
    farmId: a.editing?.farmId ?? target.id,
    name: a.name,
    kind: a.kind,
    crop: a.kind === "crop" ? a.crop : null,
    geometry: a.polygon,
  });
  localChanged();
  toastSaved();
}
