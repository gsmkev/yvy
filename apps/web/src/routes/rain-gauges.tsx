/** Pluviómetros de la estancia: mes y campaña contra el satélite y la normal (C-05, C-06). */
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { localDate } from "@yvy/shared";
import { MonthlyRainChart } from "../components/charts";
import { Empty, ErrorBox, Spinner } from "../components/ui";
import { fmtIsoDate, fmtNum } from "../lib/format";
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
const mm = (v: number | null) => (v === null ? "—" : `${fmtNum(Math.round(v * 10) / 10)} mm`);
const diff = (r: GaugeRow) => {
  const d = gaugeVsSat(r);
  return d === null ? "—" : `${d > 0 ? "+" : ""}${Math.round(d)} %`;
};

function GaugeSection({ name, months, season }: { name: string; months: GaugeRow[]; season: GaugeRow }) {
  const rows = [...months.map((m) => ({ ...m, label: monthLabel(m.key) })), { ...season, label: t("ui.gaugesSeason") }];
  const noData = season.gaugeMm === null;
  return (
    <section className="border-t border-linea pt-6">
      <h2 className="font-serif text-xl font-semibold">{name}</h2>
      {noData && <p className="mt-1 text-sm text-tinta-2">{t("ui.gaugesNoData")}</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="num w-full text-sm">
          <thead>
            <tr className="border-b border-linea text-left text-tinta-2">
              <th className="py-1.5 pr-3 font-normal">{t("ui.gaugesMonth")}</th>
              <th className="px-3 py-1.5 text-right font-normal">{t("ui.gauge")}</th>
              <th className="px-3 py-1.5 text-right font-normal">{t("ui.satelliteRain")}</th>
              <th className="px-3 py-1.5 text-right font-normal">{t("ui.rainNormal")}</th>
              <th className="py-1.5 pl-3 text-right font-normal">{t("ui.gaugesVsSat")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`border-b border-linea/60 ${r.key === "season" ? "font-semibold" : ""}`}>
                <td className="py-1.5 pr-3">{r.label}</td>
                <td className="px-3 py-1.5 text-right">{mm(r.gaugeMm)}</td>
                <td className="px-3 py-1.5 text-right">{mm(r.satMm)}</td>
                <td className="px-3 py-1.5 text-right">{mm(r.normalMm)}</td>
                <td className="py-1.5 pl-3 text-right">{diff(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <div>
        <Link
          to="/estancias/$farmId"
          params={{ farmId }}
          className="text-sm text-tinta-2 underline underline-offset-2"
        >
          {t("ui.gaugesBack")}
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold">
          {t("ui.gaugesTitle")} · {farm.data.farm.name}
        </h1>
        <p className="mt-1 text-sm text-tinta-2">
          {t("ui.gaugesIntro", { from: fmtIsoDate(from), to: fmtIsoDate(cutoff) })}
        </p>
      </div>
      {gauges.length === 0 && <Empty>{t("ui.gaugesNone")}</Empty>}
      {gauges.map((g) => (
        <GaugeSection key={g.id} name={g.name} {...gaugeTable(c, g.id, from, cutoff, tz)} />
      ))}
      {hasUnassignedRain(c) && (
        <GaugeSection name={t("ui.gaugesUnassigned")} {...gaugeTable(c, null, from, cutoff, tz)} />
      )}
    </div>
  );
}
