import { useQuery } from "@tanstack/react-query";
import type { MultiPolygon, Position } from "geojson";
import { get } from "../lib/api";
import { fmtDate, fmtHa, fmtNdvi } from "../lib/format";
import { t } from "../lib/i18n";
import type { Plot } from "../lib/types";

export interface ManagementZone {
  plotId: string;
  zone: 1 | 2 | 3;
  areaHa: number;
  pct: number;
  meanNdvi: number;
  seasons: string;
  geometry: string;
  computedAt: number;
}

export const useManagementZones = (farmId: string) =>
  useQuery({
    queryKey: ["management-zones", farmId],
    queryFn: () => get<ManagementZone[]>(`/org/farms/${farmId}/management-zones`),
    staleTime: 10 * 60_000,
  });

/** De la zona más baja a la más alta, con la rampa de vigor de la marca. */
const ZONE_COLOR: Record<number, string> = { 1: "#B5562E", 2: "#C9C46A", 3: "#3F6B35" };

/** Zonas de manejo de un lote (A-32): 3 zonas calculadas con varias campañas de vigor. */
export function ZonesSection({ plot }: { plot: Plot }) {
  const q = useManagementZones(plot.farmId);
  const zones = (q.data ?? []).filter((z) => z.plotId === plot.id);
  if (!zones.length) return null;
  const outline = JSON.parse(plot.geometry) as { type: "Polygon" | "MultiPolygon"; coordinates: Position[][] | Position[][][] };
  const rings: Position[][] = outline.type === "Polygon" ? (outline.coordinates as Position[][]) : (outline.coordinates as Position[][][]).flat();
  const all = rings.flat();
  const [x0, x1] = [Math.min(...all.map((p) => p[0]!)), Math.max(...all.map((p) => p[0]!))];
  const [y0, y1] = [Math.min(...all.map((p) => p[1]!)), Math.max(...all.map((p) => p[1]!))];
  const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const W = 300;
  const scale = W / Math.max((x1 - x0) * k, y1 - y0, 1e-9);
  const w = (x1 - x0) * k * scale;
  const h = (y1 - y0) * scale;
  const path = (rs: Position[][]) =>
    rs.map((r) => "M" + r.map((p) => `${((p[0]! - x0) * k * scale).toFixed(1)},${((y1 - p[1]!) * scale).toFixed(1)}`).join("L") + "Z").join("");
  const seasons = (JSON.parse(zones[0]!.seasons) as number[]).map((y) => `${y}/${String(y + 1).slice(2)}`).join(", ");
  return (
    <div className="border-t border-linea pt-4">
      <h3 className="eyebrow mb-1">{t("ui.zonesTitle")}</h3>
      <svg role="img" aria-label={t("ui.zonesTitle")} viewBox={`0 0 ${w.toFixed(0)} ${h.toFixed(0)}`} className="w-full max-w-[320px] rounded-md border border-linea bg-lino">
        {zones.map((z) => (
          <path
            key={z.zone}
            d={path((JSON.parse(z.geometry) as MultiPolygon).coordinates.flat())}
            fill={ZONE_COLOR[z.zone]}
            fillRule="evenodd"
          />
        ))}
        <path d={path(rings)} fill="none" stroke="#1E2419" strokeWidth="1" />
      </svg>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {zones.map((z) => (
          <li key={z.zone} className="num flex items-center gap-2">
            <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: ZONE_COLOR[z.zone] }} />
            {t(`ui.zonesLevel_${z.zone}` as "ui.zonesLevel_1")}: {fmtHa(z.areaHa)} ({z.pct} %) · NDVI {fmtNdvi(z.meanNdvi)}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-tinta-2">{t("ui.zonesNote", { seasons, date: fmtDate(zones[0]!.computedAt) })}</p>
      <p className="text-xs text-tinta-2">{t("attribution.copernicus")}</p>
    </div>
  );
}
