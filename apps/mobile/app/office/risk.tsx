/**
 * Riesgo climático (función 91): heladas, sequías, lluvia frente a lo normal y focos de calor. Sin PDF: el dueño comparte
 * el enlace de solo lectura. API: GET /org/farms/:id/risk (el informe lo calcula la corrida semanal).
 */
import { router } from "expo-router";
import { Link2 } from "lucide-react-native";
import { CHART, t, ATTRIBUTION } from "@yvy/shared";
import { fmtMmDd, fireByMonth, rainByMonth, type RiskResponse } from "../../src/lib/riskFormat";
import { getSession } from "../../src/lib/session";
import { FarmChips, useFarmPick } from "../../src/office/farmPick";
import { fmtDate, fmtNumber } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { OnlineState } from "../../src/office/state";
import { useOnline } from "../../src/office/useOnline";
import { BarList, LineChart, StatRow, type StatItem } from "../../src/office/ui";
import { EmptyState, SectionHeader, Text } from "../../src/ui/kit";
import { T } from "../../src/ui/theme";

export default function Risk() {
  const { farms, farm, setFarmId } = useFarmPick();
  const owner = getSession()?.organization.role === "owner";
  const id = farm?.id;
  const q = useOnline<RiskResponse>(id ? `/org/farms/${id}/risk` : null);
  const ready = !!q.data?.report;
  return (
    <OfficeScreen
      title={t("ui.risk.title")}
      subtitle={
        farm
          ? farm.name + (q.data?.computedAt ? " · " + t("ui.risk.computed", { date: fmtDate(q.data.computedAt) }) : "")
          : undefined
      }
      query={q}
      action={owner && ready && farm ? { label: t("ui.share.linkTitle"), icon: Link2, onPress: () => router.push(`/office/share-links?farmId=${farm.id}`) } : undefined}
    >
      <FarmChips farms={farms} value={id} onChange={setFarmId} />
      {!farm ? (
        <EmptyState title={t("office.reports.noFarms")} />
      ) : (
        <OnlineState query={q} isEmpty={(d) => d.report === null} empty={{ title: t("ui.risk.pending"), hint: t("ui.risk.pendingHint") }}>
          {({ report: r }) => {
            if (!r) return null;
            const rain = rainByMonth(r.rain);
            const fire = r.fire;
            const frost: StatItem[] = [
              { label: t("ui.risk.frostMean"), value: fmtNumber(r.frost.meanPerYear), unit: t("office.common.unitDays") },
              { label: t("ui.risk.frostYears"), value: r.frost.yearsWithFrostPct, unit: "%" },
              ...(r.frost.worst ? [{ label: t("ui.risk.frostWorst"), value: r.frost.worst.days, unit: `${t("office.common.unitDays")} · ${r.frost.worst.year}` }] : []),
              ...(r.frost.typicalFirstFrost ? [{ label: t("ui.risk.frostFirst"), value: fmtMmDd(r.frost.typicalFirstFrost) }] : []),
            ];
            const dry: StatItem[] = [
              { label: t("ui.risk.dryMean"), value: fmtNumber(r.dry.meanLongestDays), unit: t("office.common.unitDays") },
              { label: t("ui.risk.drySummer"), value: fmtNumber(r.dry.summerMeanLongestDays), unit: t("office.common.unitDays") },
              ...(r.dry.worst ? [{ label: t("ui.risk.dryWorst"), value: r.dry.worst.days, unit: `${t("office.common.unitDays")} · ${r.dry.worst.year}` }] : []),
              { label: t("ui.risk.drySpells"), value: fmtNumber(r.dry.spells15PerYear) },
            ];
            const fireStats: StatItem[] = fire
              ? [
                  ...(fire.total > 0 ? [{ label: t("ui.risk.fireTotal"), value: fire.total }] : []),
                  ...(fire.nearestKm !== null ? [{ label: t("ui.risk.fireNearest"), value: fmtNumber(fire.nearestKm), unit: "km" }] : []),
                  ...(fire.lastAt ? [{ label: t("ui.risk.fireLast"), value: fmtDate(fire.lastAt) }] : []),
                ]
              : [];
            const fireBars = fire ? fireByMonth(fire.byMonth).filter((m) => m.value > 0) : [];
            return (
              <>
                <SectionHeader title={t("ui.risk.frostTitle")} />
                <Text style={T.small}>{t("ui.risk.frostLead", { c: r.frost.thresholdC })}</Text>
                <StatRow items={frost} />
                {r.frost.perYear.some((p) => p.days > 0) && (
                  <>
                    <Text style={[T.smallMedium, { marginTop: 16 }]}>{t("ui.risk.frostChart")}</Text>
                    <LineChart yUnit={t("office.common.unitDays")} series={[{ label: t("ui.risk.frostChart"), color: CHART.comparison, points: r.frost.perYear.map((p) => ({ x: String(p.year), y: p.days })) }]} />
                  </>
                )}
                <SectionHeader title={t("ui.risk.dryTitle")} />
                <Text style={T.small}>{t("ui.risk.dryLead", { mm: r.dry.thresholdMm })}</Text>
                <StatRow items={dry} />
                {rain.length > 0 && (
                  <>
                    <SectionHeader title={t("ui.risk.rainTitle")} />
                    <StatRow items={[{ label: t("ui.risk.rainAnnual"), value: fmtNumber(r.rain.annualMeanMm), unit: "mm" }]} />
                    <LineChart
                      yUnit="mm"
                      series={[
                        { label: t("ui.risk.rainRecent"), color: CHART.primary, points: rain.map((m) => ({ x: m.label, y: m.mm })) },
                        { label: t("ui.risk.rainNormal"), color: CHART.gauge, points: rain.map((m) => ({ x: m.label, y: m.normalMm })) },
                      ]}
                    />
                  </>
                )}
                <SectionHeader title={t("ui.risk.fireTitle")} />
                {!fire ? (
                  <Text style={T.small}>{t("ui.risk.fireMissing")}</Text>
                ) : (
                  <>
                    <Text style={T.small}>{t("ui.risk.fireLead", { km: fire.radiusKm, years: fire.years })}</Text>
                    {fire.total === 0 ? <Text style={[T.body, { marginTop: 8 }]}>{t("ui.risk.fireNone")}</Text> : <StatRow items={fireStats} />}
                    {fireBars.length > 0 && (
                      <>
                        <Text style={[T.smallMedium, { marginTop: 16 }]}>{t("ui.risk.fireByMonth")}</Text>
                        <BarList rows={fireBars} />
                      </>
                    )}
                  </>
                )}
                <Text style={[T.small, { marginTop: 16 }]}>
                  {t("ui.risk.intro", { from: r.normalFrom, to: r.normalTo })}
                </Text>
                <Text style={T.small}>
                  {t(ATTRIBUTION.nasaPower)} · {t(ATTRIBUTION.firms)}
                </Text>
                {!owner && <Text style={[T.small, { marginTop: 8 }]}>{t("office.common.riskShareHint")}</Text>}
              </>
            );
          }}
        </OnlineState>
      )}
    </OfficeScreen>
  );
}
