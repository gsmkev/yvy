import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isFieldRole } from "@yvy/shared";
import { TableExportMenu } from "../components/TableExportMenu";
import { Empty, ErrorBox, Spinner, Tabs } from "../components/ui";
import { get } from "../lib/api";
import { fmtHa, fmtNum } from "../lib/format";
import { t } from "../lib/i18n";
import { useMe } from "../lib/queries";

interface FarmRow {
  id: string;
  name: string;
  areaHa: number;
  plots: number;
  records30d: number;
  rain30Mm: number | null;
  ndvi30: number | null;
  activeAlerts: number;
}
interface SeasonRow {
  id: string;
  name: string;
  plannedHa: number;
  plots: number;
  harvestedHa: number;
  harvestTons: number;
  yieldTHa: number | null;
  targetYieldTHa: number | null;
  applications: number;
}

/** Barra horizontal proporcional al máximo de la columna; el número va al lado (no depende del color). */
function Bar({ value, max, label }: { value: number | null; max: number; label: string }) {
  if (value === null) return <span className="text-tinta-2">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 rounded-full bg-surco/10" aria-hidden>
        <div className="h-2 rounded-full bg-soja" style={{ width: `${max > 0 ? Math.max(4, (100 * value) / max) : 0}%` }} />
      </div>
      <span className="num text-sm">{label}</span>
    </div>
  );
}

const maxOf = (xs: (number | null)[]) => Math.max(0, ...xs.filter((x): x is number => x !== null));

/** R-07: comparación entre estancias (últimos 30 días) y entre campañas (superficie, rinde, aplicaciones). */
export function ComparePage() {
  const me = useMe();
  const [tab, setTab] = useState<"farms" | "seasons">("farms");
  const allowed = !!me.data && !isFieldRole(me.data.role);
  const farms = useQuery({ enabled: allowed && tab === "farms", queryKey: ["compare", "farms"], queryFn: () => get<FarmRow[]>("/org/compare/farms") });
  const seasons = useQuery({ enabled: allowed && tab === "seasons", queryKey: ["compare", "seasons"], queryFn: () => get<SeasonRow[]>("/org/compare/seasons") });
  const q = tab === "farms" ? farms : seasons;
  return (
    <div className="mx-auto max-w-5xl p-4">
      <h1 className="mb-1 text-xl font-semibold">{t("ui.compareTitle")}</h1>
      <p className="mb-3 text-sm text-tinta-2">{tab === "farms" ? t("ui.compareFarmsHint") : t("ui.compareSeasonsHint")}</p>
      <Tabs
        tabs={[
          { id: "farms", label: t("ui.compareFarms") },
          { id: "seasons", label: t("ui.compareSeasons") },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="mt-3">
        {q.isLoading && <Spinner rows={4} h={40} />}
        {q.error && <ErrorBox error={q.error} />}
        {tab === "farms" && farms.data && (farms.data.length < 2 ? <Empty>{t("ui.compareNeedTwoFarms")}</Empty> : <FarmsTable rows={farms.data} />)}
        {tab === "seasons" && seasons.data && (seasons.data.length === 0 ? <Empty>{t("ui.compareNoSeasons")}</Empty> : <SeasonsTable rows={seasons.data} />)}
      </div>
    </div>
  );
}

function FarmsTable({ rows }: { rows: FarmRow[] }) {
  const maxRain = maxOf(rows.map((r) => r.rain30Mm));
  const maxNdvi = maxOf(rows.map((r) => r.ndvi30));
  const maxRecs = maxOf(rows.map((r) => r.records30d));
  const headers = [t("ui.farm"), t("ui.area"), t("ui.plots"), t("ui.compareRain30"), t("ui.compareNdvi30"), t("ui.compareRecords30"), t("ui.compareAlerts")];
  return (
    <>
      <div className="mb-2 flex justify-end">
        <TableExportMenu
          data={() => ({
            name: t("ui.compareFile"),
            headers,
            rows: rows.map((r) => [r.name, r.areaHa, r.plots, r.rain30Mm, r.ndvi30, r.records30d, r.activeAlerts]),
          })}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-linea text-tinta-2">
              {headers.map((h) => (
                <th key={h} className="py-2 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-linea">
                <th scope="row" className="py-2 pr-3 text-left font-medium">
                  {r.name}
                </th>
                <td className="num pr-3">{fmtHa(r.areaHa)}</td>
                <td className="num pr-3">{r.plots}</td>
                <td className="pr-3"><Bar value={r.rain30Mm} max={maxRain} label={r.rain30Mm === null ? "" : `${fmtNum(r.rain30Mm)} mm`} /></td>
                <td className="pr-3"><Bar value={r.ndvi30} max={maxNdvi} label={r.ndvi30 === null ? "" : fmtNum(r.ndvi30)} /></td>
                <td className="pr-3"><Bar value={r.records30d} max={maxRecs} label={String(r.records30d)} /></td>
                <td className="num">{r.activeAlerts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SeasonsTable({ rows }: { rows: SeasonRow[] }) {
  const maxYield = maxOf(rows.flatMap((r) => [r.yieldTHa, r.targetYieldTHa]));
  const headers = [t("ui.season"), t("ui.compareHaPlanned"), t("ui.compareHaHarvested"), t("ui.compareTons"), t("ui.compareYield"), t("ui.compareTarget"), t("ui.compareApplications")];
  return (
    <>
      <div className="mb-2 flex justify-end">
        <TableExportMenu
          data={() => ({
            name: t("ui.compareSeasonsFile"),
            headers,
            rows: rows.map((r) => [r.name, r.plannedHa, r.harvestedHa, r.harvestTons, r.yieldTHa, r.targetYieldTHa, r.applications]),
          })}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-linea text-tinta-2">
              {headers.map((h) => (
                <th key={h} className="py-2 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-linea">
                <th scope="row" className="py-2 pr-3 text-left font-medium">
                  {r.name}
                </th>
                <td className="num pr-3">{fmtHa(r.plannedHa)}</td>
                <td className="num pr-3">{fmtHa(r.harvestedHa)}</td>
                <td className="num pr-3">{fmtNum(r.harvestTons)} t</td>
                <td className="pr-3"><Bar value={r.yieldTHa} max={maxYield} label={r.yieldTHa === null ? "" : `${fmtNum(r.yieldTHa)} t/ha`} /></td>
                <td className="num pr-3">{r.targetYieldTHa === null ? "—" : `${fmtNum(r.targetYieldTHa)} t/ha`}</td>
                <td className="num">{r.applications}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
