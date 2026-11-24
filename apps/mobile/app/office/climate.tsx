/**
 * Clima de la estancia (funciones 63 y 65): pronóstico de 10 días, lluvia de 30 días contra lo normal, lluvia satelital por mes,
 * humedad del suelo, temperaturas y SPI. API: /org/farms/:id/climate, /org/farms/:id/spi; el pronóstico lo baja ForecastStrip.
 */
import { useMemo } from "react";
import { View } from "react-native";
import {
  addDays,
  CHART,
  localDate,
  spiCategory,
  t,
  type FarmSpi,
  type MessageKey,
  cToTemp,
  mmToRain,
  rainLabel,
  tempLabel,
  dayOfYear,
  rainByDate,
  type ClimateData,
  ATTRIBUTION,
} from "@yvy/shared";
import { FarmChips, useFarmPick } from "../../src/office/farmPick";
import { fmtNumber } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { OnlineState } from "../../src/office/state";
import { useOnline } from "../../src/office/useOnline";
import { useUnits } from "../../src/lib/units";
import { BarList, KeyValue, LineChart, StatRow, type StatItem } from "../../src/office/ui";
import { ForecastStrip } from "../../src/ui/ForecastStrip";
import { EmptyState, SectionHeader, Text } from "../../src/ui/kit";
import { C, T } from "../../src/ui/theme";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ddmm = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;
type Daily = ClimateData["daily"][number];

export default function Climate() {
  const units = useUnits();
  const rainU = (mm: number) => mmToRain(mm, units.rain);
  const rl = rainLabel(units.rain);
  const { farms, farm, setFarmId } = useFarmPick();
  const id = farm?.id;
  const q = useOnline<ClimateData>(id ? `/org/farms/${id}/climate?days=180` : null);
  const spi = useOnline<{ computedAt: number | null; report: FarmSpi | null }>(id ? `/org/farms/${id}/spi` : null, { ttlMs: 60 * 60_000 });

  const model = useMemo(() => {
    const c = q.data;
    if (!c) return null;
    const today = localDate(Date.now());
    const rain = rainByDate(c.daily);
    const normal = new Map(c.climatology.filter((x) => x.variable === "precip").map((x) => [x.dayOfYear, x.mean]));
    const gauge = new Map<string, number>();
    for (const g of c.gauge) gauge.set(localDate(g.capturedAt), (gauge.get(localDate(g.capturedAt)) ?? 0) + g.mm);
    const days = Array.from({ length: 60 }, (_, i) => addDays(today, i - 59));
    const last30 = days.slice(-30);
    const rain30 = last30.reduce((a, d) => a + (rain.get(d) ?? 0), 0);
    const normal30 = last30.reduce((a, d) => a + (normal.get(dayOfYear(d)) ?? 0), 0);
    const byMonth = new Map<string, number>();
    for (const [d, mm] of rain) byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) ?? 0) + mm);
    const soil = [...c.daily].reverse().find((d: Daily) => d.soilMoisture0_7 != null);
    const temps = c.daily.filter((d: Daily) => d.date >= addDays(today, -29) && (d.tmaxC != null || d.tminC != null)).sort((a, b) => a.date.localeCompare(b.date));
    return { days, rain, gauge, rain30, normal30, hasRain: rain.size > 0, hasGauge: gauge.size > 0, soil, temps, months: [...byMonth].sort(([a], [b]) => a.localeCompare(b)) };
  }, [q.data]);

  const stats: StatItem[] = [];
  if (model?.hasRain) stats.push({ label: t("ui.rain.30"), value: fmtNumber(rainU(model.rain30)), unit: rl });
  if (model?.hasRain && model.normal30 > 0) stats.push({ label: t("ui.rain.normal"), value: `${Math.round((model.rain30 / model.normal30) * 100)} %`, unit: `${fmtNumber(rainU(model.normal30))} ${rl}` });
  if (model?.soil?.soilMoisture0_7 != null) stats.push({ label: t("ui.soil.moisture"), value: Math.round(model.soil.soilMoisture0_7 * 100), unit: "%" });

  return (
    <OfficeScreen title={t("office.climate.title")} subtitle={farm?.name} query={q}>
      <FarmChips farms={farms} value={id} onChange={setFarmId} />
      {!farm ? (
        <EmptyState title={t("office.reports.noFarms")} />
      ) : (
        <>
          <ForecastStrip farmId={farm.id} />
          <OnlineState query={q} isEmpty={() => false} empty={{ title: t("ui.no.climate") }}>
            {() =>
              !model || (!model.hasRain && stats.length === 0 && model.temps.length === 0) ? (
                <EmptyState title={t("ui.no.climate")} />
              ) : (
                <>
                  {stats.length > 0 && <StatRow items={stats} />}
                  {model.hasRain && (
                    <>
                      <SectionHeader title={t("office.climate.rain60")} />
                      <LineChart
                        yUnit={rl}
                        series={[
                          { label: t("ui.common.satelliteRain"), color: CHART.comparison, points: model.days.map((d) => ({ x: ddmm(d), y: model.rain.has(d) ? rainU(model.rain.get(d)!) : null })) },
                          ...(model.hasGauge ? [{ label: t("ui.common.gauge"), color: CHART.gauge, points: model.days.map((d) => ({ x: ddmm(d), y: model.gauge.has(d) ? rainU(model.gauge.get(d)!) : null })) }] : []),
                        ]}
                      />
                      <SectionHeader title={t("office.climate.rainMonthly")} />
                      <BarList
                        unit={rl}
                        rows={model.months.map(([m, v]) => ({
                          label: `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`,
                          value: Math.round(rainU(v) * 10) / 10,
                        }))}
                      />
                      <Text style={[T.small, { marginTop: 8 }]}>{t(ATTRIBUTION.chirps)}</Text>
                    </>
                  )}
                  {model.temps.length > 0 && (
                    <>
                      <SectionHeader title={t("office.climate.forecastTemp")} />
                      <LineChart
                        yUnit={tempLabel(units.temp)}
                        series={[
                          { label: t("ui.common.tmax"), color: CHART.warm, points: model.temps.map((d) => ({ x: ddmm(d.date), y: d.tmaxC == null ? null : cToTemp(d.tmaxC, units.temp) })) },
                          { label: t("ui.common.tmin"), color: CHART.comparison, points: model.temps.map((d) => ({ x: ddmm(d.date), y: d.tminC == null ? null : cToTemp(d.tminC, units.temp) })) },
                        ]}
                      />
                      <Text style={[T.small, { marginTop: 8 }]}>{t(ATTRIBUTION.nasaPower)}</Text>
                    </>
                  )}
                </>
              )
            }
          </OnlineState>
          <SectionHeader title={t("ui.spi.title")} />
          {spi.data?.report ? (
            <View>
              <Text style={T.small}>{t("ui.spi.intro", { month: spi.data.report.throughMonth })}</Text>
              <KeyValue
                rows={spi.data.report.scales.map((s) => ({
                  label: t("ui.spi.scale", { n: s.scale }),
                  value:
                    s.spi === null
                      ? t(s.reason === "no_reference" ? "ui.spi.noReference" : "ui.spi.incomplete")
                      : `${fmtNumber(s.spi, 2)} · ${t(`ui.spi.cat_${spiCategory(s.spi)}` as MessageKey)}`,
                }))}
              />
              <Text style={[T.small, { marginTop: 8, color: C.tinta2 }]}>{t("ui.spi.note")}</Text>
            </View>
          ) : spi.data ? (
            <Text style={T.small}>{t("ui.spi.none")}</Text>
          ) : spi.error ? (
            <Text style={T.small}>{spi.error}</Text>
          ) : null}
        </>
      )}
    </OfficeScreen>
  );
}
