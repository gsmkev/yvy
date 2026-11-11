/** Informe de riesgo climático en PDF (C-10), con los estilos del parte semanal y del informe para el banco. */
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { BRAND } from "@yvy/shared";
import { fmtDate, fmtHa, fmtNum } from "./format";
import { t } from "./i18n";
import { s } from "./reportPdf";
import { Kpi } from "./reportsPdf";
import { fireByMonth, fmtMmDd, monthName, pctOfNormal, rainByMonth, type RiskResponse } from "./riskData";
import type { Farm } from "./types";

export interface RiskReportData {
  farm: Farm;
  risk: NonNullable<RiskResponse["report"]>;
  computedAt: number;
  generatedAt: number;
}

const Footer = () => (
  <View style={s.footer} fixed>
    <Text>{t("ui.riskFooter")}</Text>
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

export function RiskReport({ farm, risk, computedAt, generatedAt }: RiskReportData) {
  const frostMax = Math.max(1, ...risk.frost.perYear.map((p) => p.days));
  const rain = rainByMonth(risk.rain);
  const rainMax = Math.max(1, ...rain.flatMap((r) => [r.mm, r.normalMm ?? 0]));
  const fire = risk.fire;
  const fireMonths = fire ? fireByMonth(fire.byMonth) : [];
  const fireMax = Math.max(1, ...fireMonths.map((m) => m.value));
  return (
    <Document title={`${t("ui.riskTitle")} · ${farm.name}`} author="Yvy" language="es-PY">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>
          {t("ui.riskTitle")} · {farm.name}
        </Text>
        <Text style={s.muted}>
          {[farm.department, farm.district].filter(Boolean).join(", ")}
          {farm.department || farm.district ? " · " : ""}
          {fmtHa(farm.areaHa)} · {t("ui.sharedGenerated", { date: fmtDate(generatedAt) })} ·{" "}
          {t("ui.riskComputed", { date: fmtDate(computedAt) })}
        </Text>
        <Text style={[s.muted, { marginTop: 4 }]}>
          {t("ui.riskIntro", { from: risk.normalFrom, to: risk.normalTo })}
        </Text>

        <Text style={s.h2}>{t("ui.riskFrostTitle")}</Text>
        <View style={s.kpis}>
          <Kpi label={t("ui.riskFrostMean")} value={t("ui.riskDays", { n: fmtNum(risk.frost.meanPerYear) })} note={t("ui.riskFrostLead", { c: risk.frost.thresholdC })} />
          <Kpi
            label={t("ui.riskFrostWorst")}
            value={risk.frost.worst ? t("ui.riskDays", { n: risk.frost.worst.days }) : "—"}
            note={risk.frost.worst ? String(risk.frost.worst.year) : undefined}
          />
          <Kpi label={t("ui.riskFrostYears")} value={`${risk.frost.yearsWithFrostPct} %`} />
          <Kpi label={t("ui.riskFrostFirst")} value={fmtMmDd(risk.frost.typicalFirstFrost)} note={`${t("ui.riskFrostLast")}: ${fmtMmDd(risk.frost.typicalLastFrost)}`} />
        </View>
        <Text style={[s.muted, { marginTop: 6, marginBottom: 2 }]}>{t("ui.riskFrostChart")}</Text>
        {risk.frost.perYear.map((p) => (
          <View key={p.year} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 8.5 }} wrap={false}>
            <Text style={{ width: 28, fontSize: 7 }}>{p.year}</Text>
            <Bar value={p.days} max={frostMax} />
            <Text style={{ width: 18, fontSize: 7, textAlign: "right" }}>{p.days}</Text>
          </View>
        ))}

        <View break>
          <Text style={s.h2}>{t("ui.riskRainTitle")}</Text>
          <View style={s.kpis}>
            <Kpi label={t("ui.riskRainAnnual")} value={`${fmtNum(risk.rain.annualMeanMm)} mm`} />
          </View>
          <View style={[s.th, { marginTop: 8 }]}>
            <Text style={{ width: 55 }}>{t("ui.gaugesMonth")}</Text>
            <Text style={{ width: 70 }}>{t("ui.riskRainRecent")}</Text>
            <Text style={{ width: 70 }}>{t("ui.riskRainNormal")}</Text>
            <Text style={{ width: 80 }}>{t("ui.riskRainRange")}</Text>
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

        <Text style={s.h2}>{t("ui.riskDryTitle")}</Text>
        <Text style={s.muted}>{t("ui.riskDryLead", { mm: risk.dry.thresholdMm })}</Text>
        <View style={s.kpis}>
          <Kpi label={t("ui.riskDryMean")} value={t("ui.riskDays", { n: fmtNum(risk.dry.meanLongestDays) })} />
          <Kpi
            label={t("ui.riskDryWorst")}
            value={risk.dry.worst ? t("ui.riskDays", { n: risk.dry.worst.days }) : "—"}
            note={risk.dry.worst ? String(risk.dry.worst.year) : undefined}
          />
          <Kpi label={t("ui.riskDrySummer")} value={t("ui.riskDays", { n: fmtNum(risk.dry.summerMeanLongestDays) })} />
          <Kpi label={t("ui.riskDrySpells")} value={fmtNum(risk.dry.spells15PerYear)} />
        </View>

        <View wrap={false}>
          <Text style={s.h2}>{t("ui.riskFireTitle")}</Text>
          {!fire ? (
            <Text style={s.muted}>{t("ui.riskFireMissing")}</Text>
          ) : (
            <View>
              <Text style={s.muted}>{t("ui.riskFireLead", { km: fire.radiusKm, years: fire.years })}</Text>
              <View style={s.kpis}>
                <Kpi label={t("ui.riskFireTotal")} value={String(fire.total)} />
                <Kpi label={t("ui.riskFireNearest")} value={fire.nearestKm !== null ? t("ui.riskKm", { n: fmtNum(fire.nearestKm) }) : "—"} />
                <Kpi label={t("ui.riskFireLast")} value={fire.lastAt ? fmtDate(fire.lastAt) : "—"} />
              </View>
              {fire.total === 0 ? (
                <Text style={{ marginTop: 6 }}>{t("ui.riskFireNone")}</Text>
              ) : (
                <View style={{ marginTop: 6 }}>
                  <Text style={[s.muted, { marginBottom: 2 }]}>{t("ui.riskFireByMonth")}</Text>
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
