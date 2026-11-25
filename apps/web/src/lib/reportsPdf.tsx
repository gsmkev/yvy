/** Resumen de campaña por lote en PDF, con los estilos del parte semanal. */
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { describeData } from "./exports";
import { fmtDate, fmtDateTime, fmtHa, fmtIsoDate, fmtNdvi, fmtNum } from "./format";
import { t, tk } from "./i18n";
import { s } from "./reportPdf";
import type { NdviPoint } from "./reportsData";
import type { Farm, Plot, RecordRow } from "./types";
import { ATTRIBUTION } from "@yvy/shared";

/** Pie fijo de las páginas del informe. */
export const Footer = () => (
  <View style={s.footer} fixed>
    <Text>{t("ui.reports.footerCredit", { copernicus: t(ATTRIBUTION.copernicus), chirps: t(ATTRIBUTION.chirps) })}</Text>
    <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
  </View>
);

/** Milímetros con su unidad; "—" si no hay dato. */
export const mm = (v: number | null) => (v === null ? "—" : `${fmtNum(Math.round(v))} mm`);

/** Cifra destacada con su etiqueta y una nota opcional. */
export function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={s.kpi}>
      <Text style={s.muted}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      {note ? <Text style={s.muted}>{note}</Text> : null}
    </View>
  );
}

// ---------- Resumen de campaña ----------

interface SeasonReportData {
  farm: Farm;
  plot: Plot;
  from: string;
  to: string;
  records: RecordRow[];
  rainMm: number | null;
  normalMm: number | null;
  gaugeMm: number | null;
  ndvi: NdviPoint[];
}

/** Documento PDF del resumen de campaña por lote. */
export function SeasonReport(d: SeasonReportData) {
  const byKind = new Map<string, RecordRow[]>();
  for (const r of d.records) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  const daysSince = d.plot.sowingDate
    ? Math.max(0, Math.floor((Date.parse(`${d.to}T00:00:00Z`) - Date.parse(`${d.plot.sowingDate}T00:00:00Z`)) / 86_400_000))
    : null;
  const ndvi = [...d.ndvi].sort((a, b) => a.acquiredAt - b.acquiredAt);
  return (
    <Document title={`${t("ui.season.reportTitle")}: ${d.plot.name}`} author="Yvy" language="es-PY">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>
          {t("ui.season.reportTitle")}: {d.plot.name}
        </Text>
        <Text style={s.muted}>
          {d.farm.name}, {fmtIsoDate(d.from)} – {fmtIsoDate(d.to)}
        </Text>

        <Text style={s.h2}>{t("ui.season.sowing")}</Text>
        <View style={s.kpis}>
          <Kpi label={t("ui.common.crop")} value={d.plot.kind === "pasture" ? t("ui.common.pasture") : (d.plot.crop ?? "—")} />
          <Kpi label={t("ui.common.season")} value={d.plot.season ?? "—"} />
          <Kpi
            label={t("ui.common.sowingDate")}
            value={d.plot.sowingDate ? fmtIsoDate(d.plot.sowingDate) : "—"}
            note={daysSince !== null ? t("ui.season.daysSince", { n: daysSince }) : t("ui.season.noSowing")}
          />
          <Kpi label={t("ui.common.area")} value={fmtHa(d.plot.areaHa)} />
        </View>

        <Text style={s.h2}>{t("ui.season.rainTitle")}</Text>
        <View style={s.kpis}>
          <Kpi label={t("ui.common.satelliteRain")} value={mm(d.rainMm)} />
          <Kpi label={t("ui.shared.rainNormal")} value={mm(d.normalMm)} />
          <Kpi label={t("ui.common.gauge")} value={mm(d.gaugeMm)} />
        </View>

        <Text style={s.h2}>{t("ui.season.recordsByKind")}</Text>
        {byKind.size === 0 ? (
          <Text style={s.muted}>{t("ui.no.records")}</Text>
        ) : (
          <View>
            <View style={s.th}>
              <Text style={{ width: 110 }}>{t("ui.common.kind")}</Text>
              <Text style={{ width: 40 }}>{t("ui.season.count")}</Text>
              <Text style={{ flex: 1 }}>{t("ui.season.last")}</Text>
            </View>
            {[...byKind.entries()].map(([kind, rows]) => {
              const last = rows[0]!; // vienen del más nuevo al más viejo
              return (
                <View key={kind} style={s.row} wrap={false}>
                  <Text style={{ width: 110 }}>{tk(`record-kinds.kind.${kind}`)}</Text>
                  <Text style={{ width: 40 }}>{rows.length}</Text>
                  <Text style={{ flex: 1 }}>
                    {fmtDateTime(last.capturedAt)}: {describeData(last.kind, last.data)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <Text style={s.h2}>{t("ui.season.vigorTitle")}</Text>
        {ndvi.length === 0 ? (
          <Text style={s.muted}>{t("ui.shared.noData")}</Text>
        ) : (
          <View>
            <View style={s.th}>
              <Text style={{ width: 90 }}>{t("ui.common.capturedAt")}</Text>
              <Text style={{ width: 70 }}>{t("ui.index.ndviShort")}</Text>
              <Text style={{ flex: 1 }}>p10 – p90</Text>
            </View>
            {ndvi.map((p) => (
              <View key={p.acquiredAt} style={s.row} wrap={false}>
                <Text style={{ width: 90 }}>{fmtDate(p.acquiredAt)}</Text>
                <Text style={{ width: 70 }}>{fmtNdvi(p.mean)}</Text>
                <Text style={{ flex: 1 }}>
                  {fmtNdvi(p.p10)} – {fmtNdvi(p.p90)}
                </Text>
              </View>
            ))}
          </View>
        )}
        <Footer />
      </Page>
    </Document>
  );
}
