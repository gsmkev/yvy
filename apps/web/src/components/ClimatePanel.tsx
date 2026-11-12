import { SpiPanel } from "./SpiPanel";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { addDays, CHART, localDate, t as _t } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtIsoDate, fmtMm, fmtNum, fmtRainValue, rainUnitLabel } from "../lib/format";
import { t } from "../lib/i18n";
import { LineChart, RainChart } from "./charts";
import { CloudRain, CloudSun } from "lucide-react";
import { SprayWindows } from "./SprayWindows";
import { Empty, ErrorBox, Spinner, Stat } from "./ui";

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
  if (q.isLoading) return <Spinner rows={5} h={56} />;
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

  const wd = new Intl.DateTimeFormat("es-PY", { weekday: "short", timeZone: "UTC" });
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 border-b border-linea pb-5">
        <Stat
          label={t("ui.rain30")}
          value={hasRain ? fmtRainValue(rain30) : "—"}
          unit={hasRain ? rainUnitLabel() : undefined}
          note={
            normal30 > 0 && hasRain
              ? `${t("ui.rainNormal")} ${fmtMm(normal30)} · ${Math.round((rain30 / normal30) * 100)} %`
              : _t("attribution.chirps")
          }
        />
        <Stat
          label={t("ui.soilMoisture")}
          value={soil?.soilMoisture0_7 != null ? Math.round(soil.soilMoisture0_7 * 100) : "—"}
          unit={soil?.soilMoisture0_7 != null ? "%" : undefined}
          note={_t("attribution.nasaPower")}
        />
      </div>
      <div>
        <h3 className="eyebrow mb-2">{t("ui.rain30")} · 60 días</h3>
        {hasRain ? (
          <RainChart
            days={days}
            labels={{ satellite: t("ui.satelliteRain"), normal: t("ui.rainNormal"), gauge: t("ui.gauge") }}
            formatDate={(d) => fmtIsoDate(d).slice(0, 5)}
            ariaLabel={t("ui.rain30")}
          />
        ) : (
          <Empty icon={CloudRain}>{t("ui.noClimate")}</Empty>
        )}
      </div>
      <Link
        to="/estancias/$farmId/pluviometros"
        params={{ farmId }}
        className="self-start text-sm font-medium text-accion underline underline-offset-2"
      >
        {t("ui.gaugesLink")}
      </Link>
      <Link
        to="/estancias/$farmId/riesgo"
        params={{ farmId }}
        className="self-start text-sm font-medium text-accion underline underline-offset-2"
      >
        {t("ui.riskLink")}
      </Link>
      <div>
        <h3 className="eyebrow mb-2">{t("ui.sprayTitle")}</h3>
        <SprayWindows farmId={farmId} />
      </div>
      <div>
        <h3 className="eyebrow mb-2">{t("ui.forecast")}</h3>
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
            <div className="mt-3 overflow-x-auto">
              <table className="num w-full text-xs">
                <thead>
                  <tr className="text-tinta-2">
                    <th className="pr-2 text-left font-normal" />
                    {c.forecast.map((f) => (
                      <th key={f.validDate} className="px-1 pb-1 text-center font-normal capitalize">
                        {wd.format(new Date(`${f.validDate}T12:00:00Z`)).replace(".", "")}
                        <span className="block">{fmtIsoDate(f.validDate).slice(0, 2)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="border-t border-linea">
                  {[
                    [
                      t("ui.tmax"),
                      (f: (typeof c.forecast)[number]) => (f.tmaxC === null ? "—" : `${Math.round(f.tmaxC)}°`),
                    ],
                    [
                      t("ui.tmin"),
                      (f: (typeof c.forecast)[number]) => (f.tminC === null ? "—" : `${Math.round(f.tminC)}°`),
                    ],
                    [t("ui.rainMm"), (f: (typeof c.forecast)[number]) => (f.precipMm ? fmtNum(f.precipMm) : "·")],
                  ].map(([label, fn]) => (
                    <tr key={label as string}>
                      <th className="py-1 pr-2 text-left font-normal text-tinta-2">{label as string}</th>
                      {c.forecast.map((f) => (
                        <td key={f.validDate} className="px-1 py-1 text-center">
                          {(fn as (x: typeof f) => string)(f)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-tinta-2">{_t("attribution.metNorway")}</p>
          </>
        ) : (
          <Empty icon={CloudSun}>{t("ui.noClimate")}</Empty>
        )}
      </div>
      <SpiPanel farmId={farmId} />
    </div>
  );
}
