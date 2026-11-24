/** Informe de riesgo climático en PDF, con los estilos del parte semanal y del informe para el banco. */
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { BRAND } from "@yvy/shared";
import { fmtDate, fmtHa, fmtNum } from "./format";
import { t } from "./i18n";
import { s } from "./reportPdf";
import { Kpi } from "./reportsPdf";
import { fireByMonth, fmtMmDd, monthName, pctOfNormal, rainByMonth, type RiskResponse } from "./riskData";
import type { Farm } from "./types";

interface RiskReportData {
  farm: Farm;
  risk: NonNullable<RiskResponse["report"]>;
  computedAt: number;
  generatedAt: number;
}

const Footer = () => (
  <View style={s.footer} fixed>
    <Text>{t("ui.risk.footer")}</Text>
    <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
  </View>
);

/** Barra horizontal simple: el ancho es proporcional a `value / max`. */
function Bar({ value, max, color = BRAND.cielo }: { value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <View style={{ flex: 1, height: 7, backgroundColor: BRAND.lino }}>
      <View style={{ width: `${w}%`, height: 7, backgroundColor: color }} />
    </View>
  );
}

/** Documento PDF del informe de riesgo climático. */
export function RiskReport({ farm, risk, computedAt, generatedAt }: RiskReportData) {
  const frostMax = Math.max(1, ...risk.frost.perYear.map((p) => p.days));
  const rain = rainByMonth(risk.rain);
  const rainMax = Math.max(1, ...rain.flatMap((r) => [r.mm, r.normalMm ?? 0]));
  const fire = risk.fire;
  const fireMonths = fire ? fireByMonth(fire.byMonth) : [];
  const fireMax = Math.max(1, ...fireMonths.map((m) => m.value));
  return (
    <Document title={`${t("ui.risk.title")} · ${farm.name}`} author="Yvy" language="es-PY">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>
          {t("ui.risk.title")} · {farm.name}
        </Text>
        <Text style={s.muted}>
          {[farm.department, farm.district].filter(Boolean).join(", ")}
          {farm.department || farm.district ? " · " : ""}
          {fmtHa(farm.areaHa)} · {t("ui.shared.generated", { date: fmtDate(generatedAt) })} ·{" "}
          {t("ui.risk.computed", { date: fmtDate(computedAt) })}
        </Text>
        <Text style={[s.muted, { marginTop: 4 }]}>
          {t("ui.risk.intro", { from: risk.normalFrom, to: risk.normalTo })}
        </Text>

        <Text style={s.h2}>{t("ui.risk.frostTitle")}</Text>
        <View style={s.kpis}>
          <Kpi label={t("ui.risk.frostMean")} value={t("ui.risk.days", { n: fmtNum(risk.frost.meanPerYear) })} note={t("ui.risk.frostLead", { c: risk.frost.thresholdC })} />
          <Kpi
            label={t("ui.risk.frostWorst")}
            value={risk.frost.worst ? t("ui.risk.days", { n: risk.frost.worst.days }) : "—"}
            note={risk.frost.worst ? String(risk.frost.worst.year) : undefined}
          />
          <Kpi label={t("ui.risk.frostYears")} value={`${risk.frost.yearsWithFrostPct} %`} />
          <Kpi label={t("ui.risk.frostFirst")} value={fmtMmDd(risk.frost.typicalFirstFrost)} note={`${t("ui.risk.frostLast")}: ${fmtMmDd(risk.frost.typicalLastFrost)}`} />
        </View>
        <Text style={[s.muted, { marginTop: 6, marginBottom: 2 }]}>{t("ui.risk.frostChart")}</Text>
        {risk.frost.perYear.map((p) => (
          <View key={p.year} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 8.5 }} wrap={false}>
            <Text style={{ width: 28, fontSize: 7 }}>{p.year}</Text>
            <Bar value={p.days} max={frostMax} />
            <Text style={{ width: 18, fontSize: 7, textAlign: "right" }}>{p.days}</Text>
          </View>
        ))}

        <View break>
          <Text style={s.h2}>{t("ui.risk.rainTitle")}</Text>
          <View style={s.kpis}>
            <Kpi label={t("ui.risk.rainAnnual")} value={`${fmtNum(risk.rain.annualMeanMm)} mm`} />
          </View>
          <View style={[s.th, { marginTop: 8 }]}>
            <Text style={{ width: 55 }}>{t("ui.gauges.month")}</Text>
            <Text style={{ width: 70 }}>{t("ui.risk.rainRecent")}</Text>
            <Text style={{ width: 70 }}>{t("ui.risk.rainNormal")}</Text>
            <Text style={{ width: 80 }}>{t("ui.risk.rainRange")}</Text>
            <Text style={{ flex: 1 }} />
          </View>
          {rain.map((r) => {
            const pct = pctOfNormal(r.mm, r.normalMm);
            return (
              <View key={r.key} style={[s.row, { alignItems: "center" }]} wrap={false}>
                <Text style={{ width: 55 }}>{r.label}</Text>
                <Text style={{ width: 70 }}>
                  {fmtNum(Math.round(r.mm))} mm{pct !== null ? ` (${pct} %)` : ""}
                </Text>
                <Text style={{ width: 70 }}>{r.normalMm !== null ? `${fmtNum(Math.round(r.normalMm))} mm` : "—"}</Text>
                <Text style={{ width: 80 }}>
                  {r.p20Mm !== null && r.p80Mm !== null ? `${Math.round(r.p20Mm)} a ${Math.round(r.p80Mm)} mm` : "—"}
                </Text>
                <Bar value={r.mm} max={rainMax} />
              </View>
            );
          })}
        </View>

        <Text style={s.h2}>{t("ui.risk.dryTitle")}</Text>
        <Text style={s.muted}>{t("ui.risk.dryLead", { mm: risk.dry.thresholdMm })}</Text>
        <View style={s.kpis}>
          <Kpi label={t("ui.risk.dryMean")} value={t("ui.risk.days", { n: fmtNum(risk.dry.meanLongestDays) })} />
          <Kpi
            label={t("ui.risk.dryWorst")}
            value={risk.dry.worst ? t("ui.risk.days", { n: risk.dry.worst.days }) : "—"}
            note={risk.dry.worst ? String(risk.dry.worst.year) : undefined}
          />
          <Kpi label={t("ui.risk.drySummer")} value={t("ui.risk.days", { n: fmtNum(risk.dry.summerMeanLongestDays) })} />
          <Kpi label={t("ui.risk.drySpells")} value={fmtNum(risk.dry.spells15PerYear)} />
        </View>

        <View wrap={false}>
          <Text style={s.h2}>{t("ui.risk.fireTitle")}</Text>
          {!fire ? (
            <Text style={s.muted}>{t("ui.risk.fireMissing")}</Text>
          ) : (
            <View>
              <Text style={s.muted}>{t("ui.risk.fireLead", { km: fire.radiusKm, years: fire.years })}</Text>
              <View style={s.kpis}>
                <Kpi label={t("ui.risk.fireTotal")} value={String(fire.total)} />
                <Kpi label={t("ui.risk.fireNearest")} value={fire.nearestKm !== null ? t("ui.risk.km", { n: fmtNum(fire.nearestKm) }) : "—"} />
                <Kpi label={t("ui.risk.fireLast")} value={fire.lastAt ? fmtDate(fire.lastAt) : "—"} />
              </View>
              {fire.total === 0 ? (
                <Text style={{ marginTop: 6 }}>{t("ui.risk.fireNone")}</Text>
              ) : (
                <View style={{ marginTop: 6 }}>
                  <Text style={[s.muted, { marginBottom: 2 }]}>{t("ui.risk.fireByMonth")}</Text>
                  {fireMonths.map((m, i) => (
                    <View key={m.label} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 9 }}>
                      <Text style={{ width: 28, fontSize: 7 }}>{monthName(i + 1, true)}</Text>
                      <Bar value={m.value} max={fireMax} color={BRAND.alerta} />
                      <Text style={{ width: 18, fontSize: 7, textAlign: "right" }}>{m.value}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
        <Footer />
      </Page>
    </Document>
  );
}
