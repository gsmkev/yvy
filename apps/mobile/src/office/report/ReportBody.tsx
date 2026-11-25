/** Secciones del parte semanal: cifras, registros por tipo y autor, lluvia diaria, avisos y destacados. */
import type { ComponentProps } from "react";
import { router } from "expo-router";
import { CHART, describeRecord, mmToRain, rainLabel, t, type MessageKey } from "@yvy/shared";
import { EmptyState, Row, SectionHeader } from "../../ui/kit";
import { fmtDate, fmtNumber } from "../format";
import { BarList, DataList, LineChart, StatRow, type StatItem } from "../ui";
import { ddmm, type ReportData } from "./model";

const key = (k: string) => k as MessageKey;

type Units = { rain: Parameters<typeof mmToRain>[1] };

/** Cifras del período; solo las que tienen algo que mostrar. */
function periodStats(d: ReportData, units: Units): StatItem[] {
  const stats: StatItem[] = [];
  if (d.rows.length > 0) stats.push({ label: t("ui.nav.records"), value: d.rows.length });
  if (d.rain !== null && d.rain > 0) stats.push({ label: t("ui.rain.week"), value: fmtNumber(mmToRain(d.rain, units.rain)), unit: rainLabel(units.rain) });
  if (d.periodAlerts.length > 0) stats.push({ label: t("ui.alerts.title"), value: d.periodAlerts.length });
  if (d.done > 0) stats.push({ label: t("ui.report.tasksDone"), value: d.done });
  if (d.late > 0) stats.push({ label: t("ui.report.tasksOverdue"), value: d.late, tone: "danger" });
  return stats;
}

function RainChart({ d, units }: { d: ReportData; units: Units }) {
  const { sat, gaugeByDay, rainDays } = d.model;
  const point = (m: Map<string, number>) => rainDays.map((day) => ({ x: ddmm(day), y: m.has(day) ? mmToRain(m.get(day)!, units.rain) : null }));
  const series: ComponentProps<typeof LineChart>["series"] = [{ label: t("ui.common.satelliteRain"), color: CHART.comparison, points: point(sat) }];
  if (gaugeByDay.size) series.push({ label: t("ui.common.gauge"), color: CHART.gauge, points: point(gaugeByDay) });
  return (
    <>
      <SectionHeader title={t("ui.report.rainDaily")} />
      <LineChart yUnit={rainLabel(units.rain)} series={series} />
    </>
  );
}

function AlertRows({ alerts }: { alerts: ReportData["periodAlerts"] }) {
  return (
    <>
      <SectionHeader title={t("ui.alerts.title")} />
      {alerts.map((a) => (
        <Row key={a.id} title={`${t(key(`ui.alert.kind_${a.kind}`))}, ${t(key(`ui.severity.${a.severity}`))}`} subtitle={`${a.summary} (${fmtDate(a.validFrom)})`} />
      ))}
    </>
  );
}

function Highlights({ rows }: { rows: ReportData["highlights"] }) {
  return (
    <>
      <SectionHeader title={t("ui.report.highlights")} />
      <DataList
        rows={rows}
        keyOf={(r) => r.id}
        title={(r) => describeRecord(r.kind, r.data)}
        subtitle={(r) => [t(key(`record-kinds.kind.${r.kind}`)), r.plotName, r.authorName, fmtDate(r.capturedAt)].filter(Boolean).join(", ")}
        onPress={(r) => router.push(`/record/${r.id}`)}
        empty={{ title: "" }}
      />
    </>
  );
}

/** Contenido del parte una vez cargados los registros. */
export function ReportBody({ data: d, units }: { data: ReportData; units: Units }) {
  const stats = periodStats(d, units);
  return (
    <>
      {stats.length > 0 ? <StatRow items={stats} /> : <EmptyState title={t("ui.report.noRecords")} hint={t("ui.report.noRecordsHint")} />}
      {d.model.byKind.length > 0 && (
        <>
          <SectionHeader title={t("ui.report.byKind")} />
          <BarList rows={d.model.byKind.slice(0, 8)} />
        </>
      )}
      {d.model.byAuthor.length > 1 && (
        <>
          <SectionHeader title={t("ui.report.byAuthor")} />
          <BarList rows={d.model.byAuthor.slice(0, 8)} />
        </>
      )}
      {d.hasRainDays && <RainChart d={d} units={units} />}
      {d.periodAlerts.length > 0 && <AlertRows alerts={d.periodAlerts} />}
      {d.highlights.length > 0 && <Highlights rows={d.highlights} />}
    </>
  );
}
