/** Cambio de cobertura entre dos fechas en PDF para informes ambientales y de bancos. Análisis indicativo. */
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { BRAND, ATTRIBUTION } from "@yvy/shared";
import { analysisAreas, summarizeCover } from "@yvy/shared";
import { fmtDate, fmtHa } from "./format";
import { t } from "./i18n";
import { ChangeMap } from "./eudrPdf";
import { s } from "./reportPdf";
import { Kpi } from "./reportsPdf";
import type { AnalysisPlot, CoverMetrics, Farm, Plot } from "./types";

interface CoverReportData {
  farm: Farm;
  /** Resultados de una misma referencia (un par de fechas). */
  rows: AnalysisPlot<CoverMetrics>[];
  from: string;
  to: string;
  plots: Plot[];
  generatedAt: number;
}

const CLASSES = ["forest", "pasture", "crop", "other"] as const;

export function CoverReport({ farm, rows, from, to, plots, generatedAt }: CoverReportData) {
  const sum = summarizeCover(rows);
  const areas = analysisAreas(rows);
  const date = (iso: string) => fmtDate(Date.parse(`${iso}T12:00:00Z`));
  return (
    <Document title={`${t("ui.cover.title")} · ${farm.name}`} author="Yvy" language="es-PY">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>
          {t("ui.cover.title")} · {farm.name}
        </Text>
        <Text style={s.muted}>
          {[farm.department, farm.district].filter(Boolean).join(", ")}
          {farm.department || farm.district ? " · " : ""}
          {fmtHa(farm.areaHa)} · {t("ui.cover.range", { from: date(from), to: date(to) })} · {t("ui.shared.generated", { date: fmtDate(generatedAt) })}
        </Text>

        <View style={{ marginTop: 8, borderLeftWidth: 2, borderLeftColor: BRAND.trigo, paddingLeft: 6 }}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{t("ui.changes.disclaimerTitle")}</Text>
          <Text>{t("ui.cover.disclaimer")}</Text>
        </View>

        <View style={s.kpis}>
          <Kpi label={t("ui.cover.forestFrom", { date: date(from) })} value={fmtHa(sum.from.forest)} />
          <Kpi label={t("ui.cover.forestTo", { date: date(to) })} value={fmtHa(sum.to.forest)} />
          <Kpi label={t("ui.cover.forestLost")} value={fmtHa(sum.forestLostHa)} />
        </View>

        <Text style={s.h2}>{t("ui.cover.classesTitle")}</Text>
        <View style={s.th}>
          <Text style={{ width: 130 }}>{t("ui.cover.colClass")}</Text>
          <Text style={{ width: 100 }}>{date(from)}</Text>
          <Text style={{ width: 100 }}>{date(to)}</Text>
          <Text style={{ flex: 1 }}>{t("ui.cover.colDiff")}</Text>
        </View>
        {CLASSES.map((c) => (
          <View key={c} style={s.row} wrap={false}>
            <Text style={{ width: 130 }}>{t(`ui.cover.class_${c}`)}</Text>
            <Text style={{ width: 100 }}>{fmtHa(sum.from[c])}</Text>
            <Text style={{ width: 100 }}>{fmtHa(sum.to[c])}</Text>
            <Text style={{ flex: 1 }}>{`${sum.to[c] - sum.from[c] > 0 ? "+" : ""}${fmtHa(sum.to[c] - sum.from[c])}`}</Text>
          </View>
        ))}
        <Text style={[s.muted, { marginTop: 4 }]}>
          {t("ui.cover.conversions", { pasture: fmtHa(sum.forestToPasture), crop: fmtHa(sum.forestToCrop), other: fmtHa(sum.forestToOther) })}
        </Text>

        <Text style={s.h2}>{t("ui.cover.mapTitle")}</Text>
        <ChangeMap farm={farm} plots={plots} areas={areas} />
        {areas.length === 0 && <Text style={s.muted}>{t("ui.cover.mapNone")}</Text>}

        <Text style={s.h2}>{t("ui.cover.plotsTitle")}</Text>
        <View style={s.th}>
          <Text style={{ width: 130 }}>{t("ui.eudr.colPlot")}</Text>
          <Text style={{ width: 80 }}>{t("ui.eudr.colArea")}</Text>
          <Text style={{ width: 100 }}>{t("ui.cover.colForestLost")}</Text>
          <Text style={{ flex: 1 }}>{t("ui.cover.colValid")}</Text>
        </View>
        {rows.map((p) => (
          <View key={p.plotId} style={s.row} wrap={false}>
            <Text style={{ width: 130 }}>{p.plotName}</Text>
            <Text style={{ width: 80 }}>{fmtHa(p.plotAreaHa)}</Text>
            <Text style={{ width: 100 }}>
              {p.validPct < 60 ? "—" : fmtHa(p.metrics.forestToPasture + p.metrics.forestToCrop + p.metrics.forestToOther)}
            </Text>
            <Text style={{ flex: 1 }}>{p.validPct < 60 ? t("ui.cover.noData") : `${Math.round(p.validPct)} %`}</Text>
          </View>
        ))}

        <View wrap={false}>
          <Text style={s.h2}>{t("ui.cover.methodTitle")}</Text>
          <Text>{t("ui.cover.method")}</Text>
          <Text style={{ marginTop: 3 }}>{t("ui.cover.methodLimits")}</Text>
          <Text style={[s.muted, { marginTop: 3 }]}>{t(ATTRIBUTION.copernicus)}.</Text>
        </View>
        <View style={s.footer} fixed>
          <Text>{t("ui.cover.footer")}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
