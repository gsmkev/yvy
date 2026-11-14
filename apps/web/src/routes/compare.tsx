import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isFieldRole } from "@yvy/shared";
import { TableExportMenu } from "../components/TableExportMenu";
import { Link } from "@tanstack/react-router";
import { EmptyState, ErrorBox, PageHeader, Skeleton, Tabs } from "../components/ui";
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
  const exportData =
    tab === "farms" && farms.data && farms.data.length >= 2
      ? () => farmsTable(farms.data!)
      : tab === "seasons" && seasons.data?.length
        ? () => seasonsTable(seasons.data!)
        : null;
  const toList = (
    <Link
      to="/"
      className="inline-flex h-10 items-center rounded-md border border-linea bg-papel px-3.5 text-sm font-medium text-surco hover:border-tinta-2/40 hover:bg-lino"
    >
      {t("ui.farmsTitle")}
    </Link>
  );
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <PageHeader title={t("ui.compareTitle")} menu={exportData && <TableExportMenu data={exportData} />} />
      <Tabs
        tabs={[
          { id: "farms", label: t("ui.compareFarms") },
          { id: "seasons", label: t("ui.compareSeasons") },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div>
        {q.isLoading && <Skeleton h={120} />}
        {q.error && <ErrorBox error={q.error} />}
        {tab === "farms" &&
          farms.data &&
          (farms.data.length < 2 ? (
            <EmptyState
              title={t("ui.compareNeedTwoFarms")}
              action={
                <Link
                  to="/estancias/nueva"
                  className="inline-flex h-10 items-center rounded-md bg-accion px-3.5 text-sm font-medium text-sobre hover:bg-accion-2"
                >
                  {t("ui.newFarm")}
                </Link>
              }
            >
              {t("ui.compareNeedTwoFarmsHint")}
            </EmptyState>
          ) : (
            <FarmsTable rows={farms.data} />
          ))}
        {tab === "seasons" &&
          seasons.data &&
          (seasons.data.length === 0 ? (
            <EmptyState title={t("ui.compareNoSeasons")} action={toList}>
              {t("ui.compareNoSeasonsHint")}
            </EmptyState>
          ) : (
            <SeasonsTable rows={seasons.data} />
          ))}
      </div>
    </div>
  );
}

const farmsHeaders = () => [t("ui.farm"), t("ui.area"), t("ui.plots"), t("ui.compareRain30"), t("ui.compareNdvi30"), t("ui.compareRecords30"), t("ui.compareAlerts")];
const farmsTable = (rows: FarmRow[]) => ({
  name: t("ui.compareFile"),
  headers: farmsHeaders(),
  rows: rows.map((r) => [r.name, r.areaHa, r.plots, r.rain30Mm, r.ndvi30, r.records30d, r.activeAlerts]),
});
const seasonsHeaders = () => [t("ui.season"), t("ui.compareHaPlanned"), t("ui.compareHaHarvested"), t("ui.compareTons"), t("ui.compareYield"), t("ui.compareTarget"), t("ui.compareApplications")];
const seasonsTable = (rows: SeasonRow[]) => ({
  name: t("ui.compareSeasonsFile"),
  headers: seasonsHeaders(),
  rows: rows.map((r) => [r.name, r.plannedHa, r.harvestedHa, r.harvestTons, r.yieldTHa, r.targetYieldTHa, r.applications]),
});

function FarmsTable({ rows }: { rows: FarmRow[] }) {
  const maxRain = maxOf(rows.map((r) => r.rain30Mm));
  const maxNdvi = maxOf(rows.map((r) => r.ndvi30));
  const maxRecs = maxOf(rows.map((r) => r.records30d));
  const headers = farmsHeaders();
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
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
                <th scope="row" className="sticky left-0 bg-lino py-2 pr-3 text-left font-medium">
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
  const headers = seasonsHeaders();
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
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
                <th scope="row" className="sticky left-0 bg-lino py-2 pr-3 text-left font-medium">
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
