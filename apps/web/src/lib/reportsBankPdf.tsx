/** Informe para el banco en PDF, con los estilos del parte semanal. */
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { fmtDate, fmtHa, fmtIsoDate, fmtNdvi, fmtNum } from "./format";
import { t, tk } from "./i18n";
import { MiniMap, s } from "./reportPdf";
import { Footer, Kpi, mm } from "./reportsPdf";
import type { VigorSummary } from "./reportsData";
import type { Alert, Farm, Plot } from "./types";

interface BankReportData {
  farm: Farm;
  plots: Plot[];
  vigor: Map<string, VigorSummary>;
  rain30: number | null;
  normal30: number | null;
  rainSeason: number | null;
  normalSeason: number | null;
  seasonFrom: string;
  to: string;
  alerts: Alert[];
  generatedAt: number;
}

const pct = (v: number | null, n: number | null) =>
  v !== null && n ? `${fmtNum(Math.round((v / n) * 100))} % ${t("ui.bank.ofNormal")}` : undefined;

export function BankReport(d: BankReportData) {
  const byCrop = new Map<string, { n: number; ha: number }>();
  for (const p of d.plots) {
    const key = p.kind === "pasture" ? t("ui.common.pasture") : (p.crop ?? "—");
    const cur = byCrop.get(key) ?? { n: 0, ha: 0 };
    byCrop.set(key, { n: cur.n + 1, ha: cur.ha + p.areaHa });
  }
  return (
    <Document title={`${t("ui.bank.reportTitle")} · ${d.farm.name}`} author="Yvy" language="es-PY">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>
          {t("ui.bank.reportTitle")} · {d.farm.name}
        </Text>
        <Text style={s.muted}>
          {[d.farm.department, d.farm.district].filter(Boolean).join(", ")}
          {d.farm.department || d.farm.district ? " · " : ""}
          {t("ui.shared.generated", { date: fmtDate(d.generatedAt) })}
        </Text>
        <View style={s.kpis}>
          <Kpi label={t("ui.common.area")} value={fmtHa(d.farm.areaHa)} />
          <Kpi label={t("ui.common.plots")} value={String(d.plots.length)} />
          <Kpi label={t("ui.alerts.title")} value={String(d.alerts.length)} />
        </View>
        <View style={{ marginTop: 8 }}>
          <MiniMap farm={d.farm} plots={d.plots} records={[]} height={170} />
        </View>

        <Text style={s.h2}>{t("ui.bank.crops")}</Text>
        <View style={s.th}>
          <Text style={{ width: 150 }}>{t("ui.common.crop")}</Text>
          <Text style={{ width: 60 }}>{t("ui.common.plots")}</Text>
          <Text style={{ flex: 1 }}>{t("ui.common.area")}</Text>
        </View>
        {[...byCrop.entries()].map(([crop, v]) => (
          <View key={crop} style={s.row} wrap={false}>
            <Text style={{ width: 150 }}>{crop}</Text>
            <Text style={{ width: 60 }}>{v.n}</Text>
            <Text style={{ flex: 1 }}>{fmtHa(v.ha)}</Text>
          </View>
        ))}

        <Text style={s.h2}>{t("ui.bank.rainTitle")}</Text>
        <View style={s.kpis}>
          <Kpi
            label={t("ui.shared.rain30")}
            value={mm(d.rain30)}
            note={`${t("ui.shared.rainNormal")}: ${mm(d.normal30)}${pct(d.rain30, d.normal30) ? ` (${pct(d.rain30, d.normal30)})` : ""}`}
          />
          <Kpi
            label={t("ui.bank.rainSeason", { from: fmtIsoDate(d.seasonFrom) })}
            value={mm(d.rainSeason)}
            note={`${t("ui.shared.rainNormal")}: ${mm(d.normalSeason)}${
              pct(d.rainSeason, d.normalSeason) ? ` (${pct(d.rainSeason, d.normalSeason)})` : ""
            }`}
          />
        </View>

        <Text style={s.h2}>{t("ui.bank.vigorTitle")}</Text>
        <View style={s.th}>
          <Text style={{ width: 110 }}>{t("ui.common.plot")}</Text>
          <Text style={{ width: 70 }}>{t("ui.common.crop")}</Text>
          <Text style={{ width: 55 }}>{t("ui.common.area")}</Text>
          <Text style={{ width: 55 }}>{t("ui.bank.last")}</Text>
          <Text style={{ width: 55 }}>{t("ui.bank.min")}</Text>
          <Text style={{ width: 55 }}>{t("ui.bank.max")}</Text>
          <Text style={{ flex: 1 }}>{t("ui.bank.scenes")}</Text>
        </View>
        {d.plots.map((p) => {
          const v = d.vigor.get(p.id);
          return (
            <View key={p.id} style={s.row} wrap={false}>
              <Text style={{ width: 110 }}>{p.name}</Text>
              <Text style={{ width: 70 }}>{p.kind === "pasture" ? t("ui.common.pasture") : (p.crop ?? "—")}</Text>
              <Text style={{ width: 55 }}>{fmtHa(p.areaHa)}</Text>
              <Text style={{ width: 55 }}>{v?.last != null ? fmtNdvi(v.last) : "—"}</Text>
              <Text style={{ width: 55 }}>{v?.min != null ? fmtNdvi(v.min) : "—"}</Text>
              <Text style={{ width: 55 }}>{v?.max != null ? fmtNdvi(v.max) : "—"}</Text>
              <Text style={{ flex: 1 }}>{v?.n ?? 0}</Text>
            </View>
          );
        })}

        <View wrap={false}>
          <Text style={s.h2}>{t("ui.alerts.title")}</Text>
          {d.alerts.length === 0 ? (
            <Text style={s.muted}>{t("ui.shared.noAlerts")}</Text>
          ) : (
            d.alerts.map((a) => (
              <Text key={a.id}>
                • {tk(`ui.alert.kind_${a.kind}`)} ({tk(`ui.severity.${a.severity}`)}): {a.summary}
              </Text>
            ))
          )}
        </View>

        <View wrap={false}>
          <Text style={s.h2}>{t("ui.bank.deforestationTitle")}</Text>
          <Text>{t("ui.bank.deforestationNote")}</Text>
        </View>
        <Footer />
      </Page>
    </Document>
  );
}
