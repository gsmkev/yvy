/** Informe de auditoría para certificaciones en PDF, con los estilos del parte semanal. */
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { AuditReportData } from "./auditReportData";
import { BUFFER_M } from "./auditReportData";
import { fmtDate, fmtHa, fmtIsoDate, fmtNum } from "./format";
import { t, tk } from "./i18n";
import { s } from "./reportPdf";
import { Footer, Kpi } from "./reportsPdf";
import type { Farm } from "./types";

/** Documento PDF del informe de auditoría para certificaciones. */
export function AuditReport(d: AuditReportData & { farm: Farm; generatedAt: number }) {
  return (
    <Document title={`${t("ui.audit.reportTitle")}: ${d.farm.name}`} author="Yvy" language="es-PY">
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.h1}>
          {t("ui.audit.reportTitle")}: {d.farm.name}
        </Text>
        <Text style={s.muted}>
          {fmtIsoDate(d.from)} – {fmtIsoDate(d.to)}, {t("ui.shared.generated", { date: fmtDate(d.generatedAt) })}
        </Text>
        <View style={s.kpis}>
          <Kpi label={t("ui.audit.applications")} value={String(d.applications.length)} />
          <Kpi label={t("ui.audit.treatedHa")} value={fmtHa(d.totalHa)} />
          <Kpi label={t("ui.audit.flagged")} value={String(d.flagged)} />
        </View>

        <Text style={s.h2}>{t("ui.audit.operators")}</Text>
        {d.operators.length === 0 ? (
          <Text style={s.muted}>{t("ui.audit.noApplications")}</Text>
        ) : (
          d.operators.map((o) => (
            <Text key={o.name}>
              • {o.name}: {o.applications}
            </Text>
          ))
        )}

        <Text style={s.h2}>{t("ui.audit.detail")}</Text>
        <View style={s.th}>
          <Text style={{ width: 62 }}>{t("ui.audit.date")}</Text>
          <Text style={{ width: 70 }}>{t("ui.common.plot")}</Text>
          <Text style={{ width: 230 }}>{t("ui.audit.products")}</Text>
          <Text style={{ width: 70 }}>{t("ui.audit.safeHarvest")}</Text>
          <Text style={{ width: 60 }}>{t("ui.audit.buffer", { m: BUFFER_M })}</Text>
          <Text style={{ width: 80 }}>{t("ui.audit.operator")}</Text>
          <Text style={{ flex: 1 }}>{t("ui.audit.flags")}</Text>
        </View>
        {d.applications.map((a) => (
          <View key={a.id} style={s.row} wrap={false}>
            <Text style={{ width: 62 }}>{fmtDate(a.at)}</Text>
            <Text style={{ width: 70 }}>{a.plotName ?? "—"}</Text>
            <View style={{ width: 230 }}>
              {a.products.map((p, i) => (
                <Text key={i}>
                  {p.name}
                  {p.activeIngredient ? ` (${p.activeIngredient}${p.toxClass ? `, ${p.toxClass}` : ""})` : ""}: {fmtNum(p.dose)}{" "}
                  {tk(`fields.dose.unit_${p.unit}`)},{" "}
                  {p.withdrawalDays === null ? t("ui.audit.noWithdrawal") : t("ui.audit.withdrawalDays", { n: p.withdrawalDays })}
                </Text>
              ))}
            </View>
            <Text style={{ width: 70 }}>{a.safeHarvestAt ? fmtDate(a.safeHarvestAt) : "—"}</Text>
            <Text style={{ width: 60 }}>{a.nearestM === null ? "—" : `${a.nearestM} m`}</Text>
            <Text style={{ width: 80 }}>{a.operator ?? "—"}</Text>
            <Text style={{ flex: 1 }}>{a.flags.map((f) => tk(`ui.audit.flag_${f}`)).join("; ") || "—"}</Text>
          </View>
        ))}
        <Text style={[s.muted, { marginTop: 10 }]}>{t("ui.audit.disclaimer")}</Text>
        <Footer />
      </Page>
    </Document>
  );
}
