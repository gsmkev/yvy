/**
 * Pluviómetros (función 90): total del mes y de la campaña por pluviómetro, y lluvia por mes, contra el satélite y lo normal.
 * Los pluviómetros salen de la base local; la lluvia anotada de toda la campaña, de GET /org/farms/:id/climate
 * (la base local solo guarda 30 días de registros, no alcanza para la campaña).
 */
import { useMemo } from "react";
import { View } from "react-native";
import { localDate, t, mmToRain, rainLabel, campaignStart, gaugeTable, hasUnassignedRain, lastSatDate, type ClimateData, type GaugeRow } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { useLocal } from "../../src/lib/useLocal";
import { FarmChips, useFarmPick } from "../../src/office/farmPick";
import { fmtNumber } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { OnlineState } from "../../src/office/state";
import { useOnline } from "../../src/office/useOnline";
import { useUnits } from "../../src/lib/units";
import { BarList, StatRow, type StatItem } from "../../src/office/ui";
import { EmptyState, SectionHeader, Text } from "../../src/ui/kit";
import { T } from "../../src/ui/theme";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(2, 4)}`;

function Gauge({ name, months, season }: { name: string; months: GaugeRow[]; season: GaugeRow }) {
  const units = useUnits();
  const mm = (v: number) => fmtNumber(Math.round(mmToRain(v, units.rain) * 10) / 10);
  const rl = rainLabel(units.rain);
  const current = months[months.length - 1];
  const stats: StatItem[] = [];
  if (current?.gaugeMm != null) stats.push({ label: t("office.gaugesMonthTotal"), value: mm(current.gaugeMm), unit: rl });
  if (season.gaugeMm != null) stats.push({ label: t("ui.gaugesSeason"), value: mm(season.gaugeMm), unit: rl });
  if (season.gaugeMm != null && season.satMm != null) stats.push({ label: t("ui.satelliteRain"), value: mm(season.satMm), unit: rl });
  if (season.gaugeMm != null && season.normalMm != null) stats.push({ label: t("ui.rainNormal"), value: mm(season.normalMm), unit: rl });
  const bars = months.filter((m) => m.gaugeMm != null).map((m) => ({ label: monthLabel(m.key), value: Math.round(mmToRain(m.gaugeMm!, units.rain) * 10) / 10 }));
  return (
    <View>
      <SectionHeader title={name} />
      {season.gaugeMm === null ? (
        <Text style={T.small}>{t("ui.gaugesNoData")}</Text>
      ) : (
        <>
          <StatRow items={stats} />
          {bars.length > 0 && <BarList rows={bars} unit={rl} />}
        </>
      )}
    </View>
  );
}

export default function RainGauges() {
  const { farms, farm, setFarmId } = useFarmPick();
  const id = farm?.id;
  const today = localDate(Date.now());
  const from = campaignStart(today);
  const days = Math.min(400, Math.ceil((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 3);
  const q = useOnline<ClimateData>(id ? `/org/farms/${id}/climate?days=${days}` : null);
  const gauges = useLocal(() => (id ? getDb().pois(id).filter((p) => p.kind === "rain_gauge") : []), [id]);
  const cutoff = useMemo(() => (q.data ? lastSatDate(q.data.daily, today) : today), [q.data, today]);

  return (
    <OfficeScreen title={t("ui.gaugesTitle")} subtitle={farm?.name} query={q}>
      <FarmChips farms={farms} value={id} onChange={setFarmId} />
      {!farm ? (
        <EmptyState title={t("office.reportsNoFarms")} />
      ) : gauges.length === 0 ? (
        <EmptyState title={t("ui.gaugesNone")} hint={t("ui.gaugesNoneHint")} />
      ) : (
        <OnlineState query={q} isEmpty={() => false} empty={{ title: t("ui.gaugesNone") }}>
          {(c) => (
            <>
              <Text style={[T.small, { marginTop: 8 }]}>{t("ui.gaugesIntro", { from: `${from.slice(8)}/${from.slice(5, 7)}/${from.slice(0, 4)}`, to: `${cutoff.slice(8)}/${cutoff.slice(5, 7)}/${cutoff.slice(0, 4)}` })}</Text>
              {gauges.map((g) => (
                <Gauge key={g.id} name={g.name} {...gaugeTable(c, g.id, from, cutoff)} />
              ))}
              {hasUnassignedRain(c) && <Gauge name={t("ui.gaugesUnassigned")} {...gaugeTable(c, null, from, cutoff)} />}
            </>
          )}
        </OnlineState>
      )}
    </OfficeScreen>
  );
}
