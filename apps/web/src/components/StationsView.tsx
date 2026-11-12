/**
 * Vista de un registro de monitoreo por estaciones (F-12): mapa con las estaciones y tabla de conteos con el
 * promedio contra el umbral por defecto (a revisar por un agrónomo).
 */
import { useMemo } from "react";
import { BRAND, monitorTemplate, stationAverages, type MonitorItem, type Station } from "@yvy/shared";
import { t, tk } from "../lib/i18n";
import { FarmMap, type MapPoint } from "./FarmMap";
import { ExportableTable } from "./ExportableTable";

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

export const stationsOf = (data: Record<string, unknown>): Station[] | null =>
  Array.isArray(data.stations) && data.stations.length ? (data.stations as Station[]) : null;

export function StationsView({ data }: { data: Record<string, unknown> }) {
  const stations = stationsOf(data) ?? [];
  const items = (monitorTemplate(typeof data.crop === "string" ? data.crop : null) ??
    // Sin cultivo conocido: se muestran las claves que haya en los conteos.
    [...new Set(stations.flatMap((s) => Object.keys(s.counts)))].map(
      (key): MonitorItem => ({ key, pest: "otra", unit: "perMeter", threshold: Infinity, step: 1 }),
    )) as readonly MonitorItem[];
  const avg = (data.averages as Record<string, number> | undefined) ?? stationAverages(stations, items);

  const { points, bounds } = useMemo(() => {
    const pts: MapPoint[] = [];
    stations.forEach((s, i) => {
      if (s.lon === undefined || s.lat === undefined) return;
      const over = items.some((it) => (s.counts[it.key] ?? 0) > it.threshold);
      pts.push({ id: String(i + 1), lon: s.lon, lat: s.lat, label: String(i + 1), color: over ? BRAND.alerta : BRAND.soja });
    });
    if (!pts.length) return { points: pts, bounds: null };
    const pad = 0.0006;
    const lons = pts.map((p) => p.lon);
    const lats = pts.map((p) => p.lat);
    return {
      points: pts,
      bounds: [Math.min(...lons) - pad, Math.min(...lats) - pad, Math.max(...lons) + pad, Math.max(...lats) + pad] as [number, number, number, number],
    };
  }, [data]);

  const label = (i: MonitorItem) => tk(`app.monitor_${i.key}`);
  return (
    <div className="mt-4 flex flex-col gap-4" data-testid="stations-view">
      {points.length > 0 && (
        <div>
          <h3 className="eyebrow mb-2">{t("app.stationsMapTitle")}</h3>
          <div className="overflow-hidden rounded-md border border-linea">
            <FarmMap className="h-56 w-full" points={points} bounds={bounds} />
          </div>
        </div>
      )}
      <div>
        <h3 className="eyebrow mb-2">{t("app.stationsTable")}</h3>
        <div className="overflow-x-auto">
          <ExportableTable name="estaciones">
            <table className="num w-full text-left text-sm">
              <thead>
                <tr className="border-b border-linea text-tinta-2">
                  <th className="py-1.5 pr-3 font-medium">#</th>
                  {items.map((i) => (
                    <th key={i.key} className="py-1.5 pr-3 font-medium">
                      {label(i)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stations.map((s, n) => (
                  <tr key={n} className="border-b border-linea">
                    <td className="py-1.5 pr-3" title={s.lat === undefined ? t("app.stationsNoGps") : `${s.lat.toFixed(5)}, ${s.lon!.toFixed(5)}`}>
                      {n + 1}
                    </td>
                    {items.map((i) => {
                      const v = s.counts[i.key] ?? 0;
                      return (
                        <td key={i.key} className={`py-1.5 pr-3 ${v > i.threshold ? "font-medium text-alerta" : ""}`}>
                          {fmt(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-1.5 pr-3">{t("app.stationsAverageRow")}</td>
                  {items.map((i) => (
                    <td key={i.key} className={`py-1.5 pr-3 ${(avg[i.key] ?? 0) > i.threshold ? "text-alerta" : ""}`}>
                      {fmt(avg[i.key] ?? 0)}
                    </td>
                  ))}
                </tr>
                {Number.isFinite(items[0]?.threshold) && (
                  <tr className="text-tinta-2">
                    <td className="py-1.5 pr-3">{t("app.stationsThreshold")}</td>
                    {items.map((i) => (
                      <td key={i.key} className="py-1.5 pr-3">
                        {fmt(i.threshold)}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </ExportableTable>
        </div>
        <p className="mt-2 text-xs text-tinta-2">{t("app.stationsDefaults")}</p>
      </div>
    </div>
  );
}
