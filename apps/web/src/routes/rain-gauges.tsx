/** Pluviómetros de la estancia: mes y campaña contra el satélite y la normal (C-05, C-06). */
import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { localDate } from "@yvy/shared";
import { MonthlyRainChart } from "../components/charts";
import { PageExport } from "../components/PageExport";
import { DataTable, EmptyState, ErrorBox, SectionHead, Spinner, Page, type Column } from "../components/ui";
import { fmtIsoDate, fmtMm } from "../lib/format";
import {
  campaignStart,
  gaugeTable,
  gaugeVsSat,
  hasUnassignedRain,
  lastSatDate,
  type GaugeClimate,
  type GaugeRow,
} from "../lib/gaugeData";
import { get } from "../lib/api";
import { t } from "../lib/i18n";
import { useFarm } from "../lib/queries";

const monthName = new Intl.DateTimeFormat("es-PY", { month: "short", year: "2-digit", timeZone: "UTC" });
const monthLabel = (key: string) => monthName.format(new Date(`${key}-15T12:00:00Z`)).replace(".", "");
const mm = (v: number | null) => (v === null ? "—" : fmtMm(Math.round(v * 10) / 10));
const diff = (r: GaugeRow) => {
  const d = gaugeVsSat(r);
  return d === null ? "—" : `${d > 0 ? "+" : ""}${Math.round(d)} %`;
};

type Row = GaugeRow & { label: string };

function GaugeSection({ name, months, season }: { name: string; months: GaugeRow[]; season: GaugeRow }) {
  const rows: Row[] = [...months.map((m) => ({ ...m, label: monthLabel(m.key) })), { ...season, label: t("ui.gaugesSeason") }];
  const noData = season.gaugeMm === null;
  // Los valores no se parten en dos líneas: la tabla se desplaza de costado dentro de su contenedor si no entra
  const nowrap = (s: string) => <span className="whitespace-nowrap">{s}</span>;
  const all: Column<Row>[] = [
    { id: "m", header: t("ui.gaugesMonth"), cell: (r) => <span className={`whitespace-nowrap ${r.key === "season" ? "font-semibold" : ""}`}>{r.label}</span> },
    { id: "gauge", header: t("ui.gauge"), align: "right", cell: (r) => nowrap(mm(r.gaugeMm)) },
    { id: "sat", header: t("ui.satelliteRain"), align: "right", cell: (r) => nowrap(mm(r.satMm)) },
    { id: "normal", header: t("ui.rainNormal"), align: "right", cell: (r) => nowrap(mm(r.normalMm)), hideBelow: "sm" },
    { id: "diff", header: t("ui.gaugesVsSat"), align: "right", cell: (r) => nowrap(diff(r)), hideBelow: "sm" },
  ];
  const cols = all.filter((c) => {
    // columnas sin ningún dato en la tabla no se muestran
    if (c.id === "sat") return rows.some((r) => r.satMm !== null);
    if (c.id === "normal") return rows.some((r) => r.normalMm !== null);
    if (c.id === "diff") return rows.some((r) => gaugeVsSat(r) !== null);
    return true;
  });
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <SectionHead title={name} />
      {noData && <p className="text-sm text-tinta-2">{t("ui.gaugesNoData")}</p>}
      <div className="grid items-start gap-x-10 gap-y-5 2xl:grid-cols-2">
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.key} caption={name} />
        <MonthlyRainChart
          ariaLabel={t("ui.gaugesChartLabel", { name })}
          labels={{ satellite: t("ui.satelliteRain"), normal: t("ui.rainNormal"), gauge: t("ui.gauge") }}
          months={months.map((m) => ({ label: monthLabel(m.key), gauge: m.gaugeMm, sat: m.satMm, normal: m.normalMm }))}
        />
      </div>
    </section>
  );
}

export function RainGaugesPage() {
  const { farmId } = useParams({ from: "/app/estancias/$farmId/pluviometros" });
  const farm = useFarm(farmId);
  const body = useRef<HTMLDivElement>(null);
  const today = localDate(Date.now());
  const from = campaignStart(today);
  const days = Math.ceil((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 3;
  const climate = useQuery({
    queryKey: ["climate", farmId, "gauges", from],
    queryFn: () => get<GaugeClimate>(`/org/farms/${farmId}/climate?days=${Math.min(days, 400)}`),
  });
  if (farm.isLoading || climate.isLoading) return <Spinner />;
  if (farm.error || !farm.data) return <ErrorBox error={farm.error} />;
  if (climate.error || !climate.data) return <ErrorBox error={climate.error} />;
  const tz = farm.data.farm.timezone;
  const c = climate.data;
  const cutoff = lastSatDate(c.daily, today);
  const gauges = farm.data.pois.filter((p) => p.kind === "rain_gauge");
  return (
    <Page
      width="data"
      className="gap-6"
      back={{ to: `/estancias/${farmId}/informes`, label: t("ui.reportsBack") }}
      title={t("ui.gaugesTitle")}
      menu={gauges.length > 0 ? <PageExport root={body} name={t("ui.gaugesTitle")} /> : undefined}
    >
      <p className="-mt-3 text-sm text-tinta-2">{farm.data.farm.name} · {t("ui.gaugesIntro", { from: fmtIsoDate(from), to: fmtIsoDate(cutoff) })}</p>
      {gauges.length === 0 && <EmptyState title={t("ui.gaugesNone")}>{t("ui.gaugesNoneHint")}</EmptyState>}
      <div ref={body} className="flex flex-col gap-8">
        {gauges.map((g) => (
          <GaugeSection key={g.id} name={g.name} {...gaugeTable(c, g.id, from, cutoff, tz)} />
        ))}
        {hasUnassignedRain(c) && (
          <GaugeSection name={t("ui.gaugesUnassigned")} {...gaugeTable(c, null, from, cutoff, tz)} />
        )}
      </div>
    </Page>
  );
}
