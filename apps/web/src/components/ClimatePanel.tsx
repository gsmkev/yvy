import { useQuery } from "@tanstack/react-query";
import { addDays, CHART, localDate, t as _t } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtIsoDate } from "../lib/format";
import { t } from "../lib/i18n";
import { LineChart, RainChart } from "./charts";
import { Card, Empty, ErrorBox, Spinner } from "./ui";

interface Climate {
  daily: {
    date: string;
    source: string;
    precipMm: number | null;
    tminC: number | null;
    tmaxC: number | null;
    soilMoisture0_7: number | null;
  }[];
  climatology: { dayOfYear: number; variable: string; mean: number | null; p20: number | null }[];
  forecast: {
    validDate: string;
    tminC: number | null;
    tmaxC: number | null;
    precipMm: number | null;
    windKmh: number | null;
  }[];
  forecastRunAt: number | null;
  gauge: { capturedAt: number; mm: number }[];
}

const doy = (date: string) =>
  Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${date.slice(0, 4)}-01-01T00:00:00Z`)) / 86_400_000) + 1;
const day = (d: string) => Date.parse(`${d}T12:00:00Z`);

export function ClimatePanel({ farmId }: { farmId: string }) {
  const q = useQuery({
    queryKey: ["climate", farmId],
    queryFn: () => get<Climate>(`/org/farms/${farmId}/climate?days=90`),
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const c = q.data!;
  const today = localDate(Date.now());
  // CHIRPS final reemplaza a la preliminar del mismo día
  const rainByDate = new Map<string, number>();
  for (const d of c.daily) {
    if (d.precipMm === null) continue;
    if (d.source === "chirps" || (d.source === "chirps_prelim" && !rainByDate.has(d.date)))
      rainByDate.set(d.date, d.precipMm);
  }
  const normalByDoy = new Map(c.climatology.filter((x) => x.variable === "precip").map((x) => [x.dayOfYear, x.mean]));
  const gaugeByDate = new Map<string, number>();
  for (const g of c.gauge) {
    const d = localDate(g.capturedAt);
    gaugeByDate.set(d, (gaugeByDate.get(d) ?? 0) + g.mm);
  }
  const days = Array.from({ length: 60 }, (_, i) => addDays(today, i - 59)).map((date) => ({
    date,
    mm: rainByDate.get(date) ?? null,
    normal: normalByDoy.get(doy(date)) ?? null,
    gauge: gaugeByDate.get(date) ?? null,
  }));
  const last30 = days.slice(-30);
  const rain30 = last30.reduce((a, d) => a + (d.mm ?? 0), 0);
  const normal30 = last30.reduce((a, d) => a + (d.normal ?? 0), 0);
  const soil = [...c.daily].reverse().find((d) => d.soilMoisture0_7 !== null);
  const hasRain = rainByDate.size > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card>
          <div className="text-xs text-surco/60">{t("ui.rain30")}</div>
          <div className="text-2xl font-semibold">{hasRain ? `${Math.round(rain30)} mm` : "—"}</div>
          {normal30 > 0 && hasRain && (
            <div className="text-xs text-surco/60">
              {t("ui.rainNormal")}: {Math.round(normal30)} mm ({Math.round((rain30 / normal30) * 100)} %)
            </div>
          )}
        </Card>
        <Card>
          <div className="text-xs text-surco/60">{t("ui.soilMoisture")}</div>
          <div className="text-2xl font-semibold">
            {soil?.soilMoisture0_7 != null ? `${Math.round(soil.soilMoisture0_7 * 100)} %` : "—"}
          </div>
          <div className="text-xs text-surco/60">{_t("attribution.nasaPower")}</div>
        </Card>
      </div>
      <Card>
        <h3 className="mb-2 text-sm font-semibold">{t("ui.rain30")} · 60 días</h3>
        {hasRain ? (
          <RainChart
            days={days}
            labels={{ satellite: t("ui.satelliteRain"), normal: t("ui.rainNormal"), gauge: t("ui.gauge") }}
            formatDate={(d) => fmtIsoDate(d).slice(0, 5)}
            ariaLabel={t("ui.rain30")}
          />
        ) : (
          <Empty>{t("ui.noClimate")}</Empty>
        )}
      </Card>
      <Card>
        <h3 className="mb-2 text-sm font-semibold">{t("ui.forecast")}</h3>
        {c.forecast.length ? (
          <>
            <LineChart
              ariaLabel={t("ui.forecast")}
              yLabel="°C"
              formatX={(x) => fmtIsoDate(new Date(x).toISOString().slice(0, 10)).slice(0, 5)}
              formatY={(y) => `${Math.round(y)}°`}
              series={[
                {
                  name: t("ui.tmin"),
                  color: CHART.comparison,
                  points: c.forecast.map((f) => ({ x: day(f.validDate), y: f.tminC })),
                },
                {
                  name: t("ui.tmax"),
                  color: CHART.warm,
                  points: c.forecast.map((f) => ({ x: day(f.validDate), y: f.tmaxC })),
                },
              ]}
            />
            <table className="mt-3 w-full text-xs">
              <tbody>
                <tr className="text-surco/60">
                  {c.forecast.map((f) => (
                    <td key={f.validDate} className="text-center">
                      {fmtIsoDate(f.validDate).slice(0, 5)}
                    </td>
                  ))}
                </tr>
                <tr>
                  {c.forecast.map((f) => (
                    <td key={f.validDate} className="text-center">
                      💧 {Math.round(f.precipMm ?? 0)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-surco/60">{_t("attribution.metNorway")}</p>
          </>
        ) : (
          <Empty>{t("ui.noClimate")}</Empty>
        )}
      </Card>
    </div>
  );
}
