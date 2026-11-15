import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isFieldRole } from "@yvy/shared";
import { TableExportMenu } from "../components/TableExportMenu";
import { Link } from "@tanstack/react-router";
import { DataTable, EmptyState, ErrorBox, PageHeader, Skeleton, Tabs, Page } from "../components/ui";
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
    <Page width="data" className="gap-4">
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
    </Page>
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
  const h = farmsHeaders();
  const num = (a: number | null, b: number | null) => (a ?? -1) - (b ?? -1);
  return (
    <DataTable
      caption={t("ui.compareFarms")}
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        { id: "name", header: h[0], sort: (a, b) => a.name.localeCompare(b.name, "es-PY"), cell: (r) => r.name },
        { id: "area", header: h[1], align: "right", sort: (a, b) => a.areaHa - b.areaHa, cell: (r) => fmtHa(r.areaHa) },
        { id: "plots", header: h[2], align: "right", sort: (a, b) => a.plots - b.plots, cell: (r) => r.plots },
        {
          id: "rain",
          header: h[3],
          sort: (a, b) => num(a.rain30Mm, b.rain30Mm),
          cell: (r) => <Bar value={r.rain30Mm} max={maxRain} label={r.rain30Mm === null ? "" : `${fmtNum(r.rain30Mm)} mm`} />,
        },
        {
          id: "ndvi",
          header: h[4],
          hideBelow: "sm",
          sort: (a, b) => num(a.ndvi30, b.ndvi30),
          cell: (r) => <Bar value={r.ndvi30} max={maxNdvi} label={r.ndvi30 === null ? "" : fmtNum(r.ndvi30)} />,
        },
        {
          id: "records",
          header: h[5],
          hideBelow: "md",
          sort: (a, b) => a.records30d - b.records30d,
          cell: (r) => <Bar value={r.records30d} max={maxRecs} label={String(r.records30d)} />,
        },
        { id: "alerts", header: h[6], align: "right", sort: (a, b) => a.activeAlerts - b.activeAlerts, cell: (r) => r.activeAlerts },
      ]}
    />
  );
}

function SeasonsTable({ rows }: { rows: SeasonRow[] }) {
  const maxYield = maxOf(rows.flatMap((r) => [r.yieldTHa, r.targetYieldTHa]));
  const h = seasonsHeaders();
  return (
    <DataTable
      caption={t("ui.compareSeasons")}
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        { id: "name", header: h[0], cell: (r) => r.name },
        { id: "planned", header: h[1], align: "right", cell: (r) => fmtHa(r.plannedHa) },
        { id: "harvested", header: h[2], align: "right", hideBelow: "sm", cell: (r) => fmtHa(r.harvestedHa) },
        { id: "tons", header: h[3], align: "right", hideBelow: "md", cell: (r) => `${fmtNum(r.harvestTons)} t` },
        {
          id: "yield",
          header: h[4],
          cell: (r) => <Bar value={r.yieldTHa} max={maxYield} label={r.yieldTHa === null ? "" : `${fmtNum(r.yieldTHa)} t/ha`} />,
        },
        { id: "target", header: h[5], align: "right", hideBelow: "md", cell: (r) => (r.targetYieldTHa === null ? "—" : `${fmtNum(r.targetYieldTHa)} t/ha`) },
        { id: "apps", header: h[6], align: "right", hideBelow: "lg", cell: (r) => r.applications },
      ]}
    />
  );
}
