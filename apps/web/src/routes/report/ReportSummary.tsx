import { Link } from "@tanstack/react-router";
import { BarList } from "../../components/BarList";
import { RainChart } from "../../components/charts";
import { DataTable, SectionHead, Stat, StatRow, type Column } from "../../components/ui";
import { fmtIsoDate, fmtMm, fmtRainValue, rainUnitLabel } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import type { RecordRow } from "../../lib/types";
import type { ReportData } from "./useReportData";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <SectionHead title={title} />
      {children}
    </section>
  );
}

/** Cifras del período: registros, lluvia, avisos y tareas (las vencidas, como nota de las hechas). */
export function ReportStats({ d }: { d: ReportData }) {
  const { rows, workers, weekRain, gaugeTotal, periodAlerts, tasksDone, tasksLate } = d;
  return (
    <StatRow className="border-y border-linea py-5">
      {rows.length > 0 && (
        <Stat label={t("ui.nav.records")} value={rows.length} note={`${workers} ${t("ui.common.workers").toLowerCase()}`} />
      )}
      {weekRain !== null && (
        <Stat
          label={t("ui.rain.week")}
          value={fmtRainValue(weekRain)}
          unit={rainUnitLabel()}
          note={gaugeTotal !== null ? `${t("ui.common.gauge")}: ${fmtMm(gaugeTotal)}` : t("ui.common.satelliteRain")}
        />
      )}
      {periodAlerts.length > 0 && <Stat label={t("ui.alerts.title")} value={periodAlerts.length} />}
      {tasksDone + tasksLate > 0 && (
        <Stat
          label={t("ui.report.tasksDone")}
          value={tasksDone}
          note={tasksLate > 0 && <span className="text-peligro">{t("ui.report.tasksLateNote", { n: tasksLate })}</span>}
        />
      )}
    </StatRow>
  );
}

const TOP_KINDS = 7;

/** Los tipos más frecuentes en barras; el resto se suma aparte para que la lista no se alargue ni una barra engañe. */
function splitKinds(items: { label: string; value: number }[]) {
  if (items.length <= TOP_KINDS + 1) return { top: items, rest: null };
  const rest = items.slice(TOP_KINDS);
  return { top: items.slice(0, TOP_KINDS), rest: { count: rest.length, total: rest.reduce((a, i) => a + i.value, 0) } };
}

/** Registros por tipo y autor, lluvia diaria y alertas del período. */
export function ReportCharts({ d }: { d: ReportData }) {
  const { byKind, byAuthor, hasRainDays, rainDays, periodAlerts } = d;
  const kinds = splitKinds(byKind);
  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-8">
        {byKind.length > 0 && (
          <Block title={t("ui.report.byKind")}>
            <BarList items={kinds.top} ariaLabel={t("ui.report.byKind")} />
            {kinds.rest && (
              <p className="num text-sm text-tinta-2">{t("ui.report.otherKinds", { n: kinds.rest.count, total: kinds.rest.total })}</p>
            )}
          </Block>
        )}
        {byAuthor.length > 1 && (
          <Block title={t("ui.report.byAuthor")}>
            <BarList items={byAuthor} ariaLabel={t("ui.report.byAuthor")} />
          </Block>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-8">
        {hasRainDays && (
          <Block title={t("ui.report.rainDaily")}>
            <RainChart
              days={rainDays}
              labels={{ satellite: t("ui.common.satelliteRain"), normal: t("ui.rain.normal"), gauge: t("ui.common.gauge") }}
              formatDate={(d) => fmtIsoDate(d).slice(0, 5)}
              ariaLabel={t("ui.report.rainDaily")}
            />
          </Block>
        )}
        {periodAlerts.length > 0 && (
          <Block title={t("ui.alerts.title")}>
            <ul className="flex flex-col text-sm">
              {periodAlerts.map((a) => (
                <li key={a.id} className="border-b border-linea py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{tk(`ui.alert.kind_${a.kind}`)}</span>
                    <span className="text-meta text-tinta-2">{tk(`ui.severity.${a.severity}`)}</span>
                  </div>
                  <p className="text-tinta-2">{a.summary}</p>
                </li>
              ))}
            </ul>
          </Block>
        )}
      </div>
    </div>
  );
}

/** Registros que conviene mirar primero (plagas, mortandad, robos). */
export function ReportHighlights({ rows, columns, onRowClick }: { rows: RecordRow[]; columns: Column<RecordRow>[]; onRowClick: () => void }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHead
        title={t("ui.report.highlights")}
        count={rows.length}
        action={
          <Link to="/registros" className="text-meta text-tinta-2 underline-offset-4 hover:text-surco hover:underline">
            {t("ui.report.allRecords")}
          </Link>
        }
      />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} />
    </section>
  );
}
