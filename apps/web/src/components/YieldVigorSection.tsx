/** A-22: rinde frente a vigor satelital por zona de manejo del lote, con una lectura honesta si faltan datos. */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "../lib/api";
import { fmtHa, fmtNdvi, fmtNum } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { fetchAllRecords } from "../lib/queries";
import type { Plot } from "../lib/types";
import { harvestYield, MIN_CELLS_PER_ZONE, readYieldVigor, zoneYields } from "../lib/yieldZones";
import { useManagementZones } from "./ZonesSection";
import { Skeleton } from "./ui";
import { ExportableTable } from "./ExportableTable";

interface SavedMap {
  id: string;
  seasonId: string | null;
  seasonName: string | null;
  fileName: string;
  cells: string;
}

const t1 = (n: number) => fmtNum(Math.round(n * 10) / 10);

export function YieldVigorSection({ plot }: { plot: Plot }) {
  const zonesQ = useManagementZones(plot.farmId);
  const maps = useQuery({ queryKey: ["yield-maps", plot.id], queryFn: () => get<SavedMap[]>(`/org/plots/${plot.id}/yield-maps`) });
  const harvests = useQuery({
    queryKey: ["plot-harvests", plot.id],
    queryFn: () => fetchAllRecords({ plotId: plot.id, kind: "harvest" }, 200),
  });
  const [pickedId, setPicked] = useState<string>("");
  const zones = (zonesQ.data ?? []).filter((z) => z.plotId === plot.id);
  const list = maps.data ?? [];
  const map = list.find((m) => m.id === pickedId) ?? list[0];
  const rows = useMemo(
    () => (map && zones.length ? zoneYields(zones, JSON.parse(map.cells) as [number, number, number, number][]) : []),
    [map?.id, zonesQ.data],
  );
  if (zonesQ.isLoading || maps.isLoading) return <Skeleton h={120} />;
  // Sin zonas o sin mapa de rinde no hay qué cruzar: la sección no aplica
  if (zones.length === 0 || !map) return null;
  const reading = readYieldVigor(rows);
  const harvest = harvests.data ? harvestYield(harvests.data, plot.areaHa, map?.seasonId ?? null) : null;
  const seasonYears = zones[0]
    ? (JSON.parse(zones[0].seasons) as number[]).map((y) => `${y}/${String(y + 1).slice(2)}`).join(", ")
    : "";
  return (
    <div className="border-t border-linea pt-4">
      <h3 className="eyebrow mb-1">{t("ui.yieldVigorTitle")}</h3>
      {zones.length === 0 ? (
        <p className="text-sm text-tinta-2">{t("ui.yieldVigorNoZones")}</p>
      ) : !map ? (
        <p className="text-sm text-tinta-2">{t("ui.yieldVigorNoYield")}</p>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          {list.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className="font-medium">{t("ui.yieldVigorSeason")}</span>
              <select
                className="h-9 rounded-md border border-linea bg-papel px-2"
                value={map.id}
                onChange={(e) => setPicked(e.target.value)}
              >
                {list.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.seasonName ?? t("ui.yieldVigorNoSeason")} · {m.fileName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ExportableTable name="rinde-y-vigor">
            <table className="num w-full text-left">
              <thead className="text-xs text-tinta-2">
                <tr>
                  <th className="py-1 font-medium">{t("ui.yieldVigorZone")}</th>
                  <th className="py-1 font-medium">{t("ui.yieldVigorNdvi")}</th>
                  <th className="py-1 font-medium">{t("ui.yieldVigorYield")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linea border-y border-linea">
                {rows.map((r) => (
                  <tr key={r.zone}>
                    <td className="py-2">
                      {tk(`ui.zonesLevel_${r.zone}`)}
                      <span className="block text-xs text-tinta-2">{fmtHa(r.areaHa)}</span>
                    </td>
                    <td className="py-2">{fmtNdvi(r.ndvi)}</td>
                    <td className="py-2">
                      {r.meanTHa === null ? (
                        <span className="text-tinta-2">{t("ui.yieldVigorNoCells")}</span>
                      ) : (
                        <>
                          {t1(r.meanTHa)} t/ha
                          <span className="block text-xs text-tinta-2">{t("ui.yieldVigorCells", { n: r.nCells })}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ExportableTable>
          <p className={reading.kind === "inverse" ? "font-medium text-peligro" : ""}>
            {reading.kind === "insufficient"
              ? t("ui.yieldVigorInsufficient", { min: MIN_CELLS_PER_ZONE })
              : tk(`ui.yieldVigor_${reading.kind}`, { pct: Math.abs(Math.round(reading.diffPct)) })}
          </p>
          {harvest && <p className="text-tinta-2">{t("ui.yieldVigorHarvest", { tons: t1(harvest.tons), tha: t1(harvest.tHa) })}</p>}
          <p className="text-xs text-tinta-2">{t("ui.yieldVigorNote", { seasons: seasonYears })}</p>
        </div>
      )}
    </div>
  );
}
