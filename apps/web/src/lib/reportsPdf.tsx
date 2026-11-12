/** Resumen de campaña por lote en PDF (R-03), con los estilos del parte semanal. */
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { describeData } from "./exports";
import { fmtDate, fmtDateTime, fmtHa, fmtIsoDate, fmtNdvi, fmtNum } from "./format";
import { t, tk } from "./i18n";
import { s } from "./reportPdf";
import type { NdviPoint } from "./reportsData";
import type { Farm, Plot, RecordRow } from "./types";

export const Footer = () => (
  <View style={s.footer} fixed>
    <Text>
      Yvy · {t("attribution.copernicus")} · {t("attribution.chirps")}
    </Text>
    <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
  </View>
);

export const mm = (v: number | null) => (v === null ? "—" : `${fmtNum(Math.round(v))} mm`);

export function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={s.kpi}>
      <Text style={s.muted}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      {note ? <Text style={s.muted}>{note}</Text> : null}
    </View>
  );
}

// ---------- R-03 ----------

export interface SeasonReportData {
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

export function SeasonReport(d: SeasonReportData) {
  const byKind = new Map<string, RecordRow[]>();
  for (const r of d.records) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  const daysSince = d.plot.sowingDate
    ? Math.max(0, Math.floor((Date.parse(`${d.to}T00:00:00Z`) - Date.parse(`${d.plot.sowingDate}T00:00:00Z`)) / 86_400_000))
    : null;
  const ndvi = [...d.ndvi].sort((a, b) => a.acquiredAt - b.acquiredAt);
  return (
    <Document title={`${t("ui.seasonReportTitle")} · ${d.plot.name}`} author="Yvy" language="es-PY">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>
          {t("ui.seasonReportTitle")} · {d.plot.name}
        </Text>
        <Text style={s.muted}>
          {d.farm.name} · {fmtIsoDate(d.from)} – {fmtIsoDate(d.to)}
        </Text>

        <Text style={s.h2}>{t("ui.seasonSowing")}</Text>
        <View style={s.kpis}>
          <Kpi label={t("ui.crop")} value={d.plot.kind === "pasture" ? t("ui.pasture") : (d.plot.crop ?? "—")} />
          <Kpi label={t("ui.season")} value={d.plot.season ?? "—"} />
          <Kpi
            label={t("ui.sowingDate")}
            value={d.plot.sowingDate ? fmtIsoDate(d.plot.sowingDate) : "—"}
            note={daysSince !== null ? t("ui.seasonDaysSince", { n: daysSince }) : t("ui.seasonNoSowing")}
          />
          <Kpi label={t("ui.area")} value={fmtHa(d.plot.areaHa)} />
        </View>

        <Text style={s.h2}>{t("ui.seasonRainTitle")}</Text>
        <View style={s.kpis}>
          <Kpi label={t("ui.satelliteRain")} value={mm(d.rainMm)} />
          <Kpi label={t("ui.sharedRainNormal")} value={mm(d.normalMm)} />
          <Kpi label={t("ui.gauge")} value={mm(d.gaugeMm)} />
        </View>

        <Text style={s.h2}>{t("ui.seasonRecordsByKind")}</Text>
        {byKind.size === 0 ? (
          <Text style={s.muted}>{t("ui.noRecords")}</Text>
        ) : (
          <View>
            <View style={s.th}>
              <Text style={{ width: 110 }}>{t("ui.kind")}</Text>
              <Text style={{ width: 40 }}>{t("ui.seasonCount")}</Text>
              <Text style={{ flex: 1 }}>{t("ui.seasonLast")}</Text>
            </View>
            {[...byKind.entries()].map(([kind, rows]) => {
              const last = rows[0]!; // vienen del más nuevo al más viejo
              return (
                <View key={kind} style={s.row} wrap={false}>
                  <Text style={{ width: 110 }}>{tk(`recordKinds.${kind}`)}</Text>
                  <Text style={{ width: 40 }}>{rows.length}</Text>
                  <Text style={{ flex: 1 }}>
                    {fmtDateTime(last.capturedAt)}: {describeData(last.kind, last.data)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <Text style={s.h2}>{t("ui.seasonVigorTitle")}</Text>
        {ndvi.length === 0 ? (
          <Text style={s.muted}>{t("ui.sharedNoData")}</Text>
        ) : (
          <View>
            <View style={s.th}>
              <Text style={{ width: 90 }}>{t("ui.capturedAt")}</Text>
              <Text style={{ width: 70 }}>NDVI</Text>
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
