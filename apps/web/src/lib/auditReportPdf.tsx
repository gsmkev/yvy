/** Informe de auditoría para certificaciones en PDF (R-05), con los estilos del parte semanal. */
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { AuditReportData } from "./auditReportData";
import { BUFFER_M } from "./auditReportData";
import { fmtDate, fmtHa, fmtIsoDate, fmtNum } from "./format";
import { t, tk } from "./i18n";
import { s } from "./reportPdf";
import { Footer, Kpi } from "./reportsPdf";
import type { Farm } from "./types";

export function AuditReport(d: AuditReportData & { farm: Farm; generatedAt: number }) {
  return (
    <Document title={`${t("ui.auditReportTitle")} · ${d.farm.name}`} author="Yvy" language="es-PY">
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.h1}>
          {t("ui.auditReportTitle")} · {d.farm.name}
        </Text>
        <Text style={s.muted}>
          {fmtIsoDate(d.from)} – {fmtIsoDate(d.to)} · {t("ui.sharedGenerated", { date: fmtDate(d.generatedAt) })}
        </Text>
        <View style={s.kpis}>
          <Kpi label={t("ui.auditApplications")} value={String(d.applications.length)} />
          <Kpi label={t("ui.auditTreatedHa")} value={fmtHa(d.totalHa)} />
          <Kpi label={t("ui.auditFlagged")} value={String(d.flagged)} />
        </View>

        <Text style={s.h2}>{t("ui.auditOperators")}</Text>
        {d.operators.length === 0 ? (
          <Text style={s.muted}>{t("ui.auditNoApplications")}</Text>
        ) : (
          d.operators.map((o) => (
            <Text key={o.name}>
              • {o.name}: {o.applications}
            </Text>
          ))
        )}

        <Text style={s.h2}>{t("ui.auditDetail")}</Text>
        <View style={s.th}>
          <Text style={{ width: 62 }}>{t("ui.auditDate")}</Text>
          <Text style={{ width: 70 }}>{t("ui.plot")}</Text>
          <Text style={{ width: 230 }}>{t("ui.auditProducts")}</Text>
          <Text style={{ width: 70 }}>{t("ui.auditSafeHarvest")}</Text>
          <Text style={{ width: 60 }}>{t("ui.auditBuffer", { m: BUFFER_M })}</Text>
          <Text style={{ width: 80 }}>{t("ui.auditOperator")}</Text>
          <Text style={{ flex: 1 }}>{t("ui.auditFlags")}</Text>
        </View>
        {d.applications.map((a) => (
          <View key={a.id} style={s.row} wrap={false}>
            <Text style={{ width: 62 }}>{fmtDate(a.at)}</Text>
            <Text style={{ width: 70 }}>{a.plotName ?? "—"}</Text>
            <View style={{ width: 230 }}>
              {a.products.map((p, i) => (
                <Text key={i}>
                  {p.name}
                  {p.activeIngredient ? ` (${p.activeIngredient}${p.toxClass ? `, ${p.toxClass}` : ""})` : ""} · {fmtNum(p.dose)}{" "}
                  {tk(`ui.doseUnit_${p.unit}`)} ·{" "}
                  {p.withdrawalDays === null ? t("ui.auditNoWithdrawal") : t("ui.auditWithdrawalDays", { n: p.withdrawalDays })}
                </Text>
              ))}
            </View>
            <Text style={{ width: 70 }}>{a.safeHarvestAt ? fmtDate(a.safeHarvestAt) : "—"}</Text>
            <Text style={{ width: 60 }}>{a.nearestM === null ? "—" : `${a.nearestM} m`}</Text>
            <Text style={{ width: 80 }}>{a.operator ?? "—"}</Text>
            <Text style={{ flex: 1 }}>{a.flags.map((f) => tk(`ui.auditFlag_${f}`)).join("; ") || "—"}</Text>
          </View>
        ))}
        <Text style={[s.muted, { marginTop: 10 }]}>{t("ui.auditDisclaimer")}</Text>
        <Footer />
      </Page>
    </Document>
  );
}
