import { Link } from "@tanstack/react-router";
import { BarList } from "../../components/BarList";
import { RainChart } from "../../components/charts";
import { DataTable, SectionHead, Stat, type Column } from "../../components/ui";
import { fmtIsoDate, fmtMm } from "../../lib/format";
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

/** Cifras del período: registros, lluvia, alertas y tareas. */
export function ReportStats({ d }: { d: ReportData }) {
  const { rows, workers, weekRain, gaugeTotal, periodAlerts, tasksDone, tasksLate } = d;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-linea py-5 sm:grid-cols-3 lg:grid-cols-5">
      {rows.length > 0 && (
        <Stat label={t("ui.navRecords")} value={rows.length} note={`${workers} ${t("ui.workers").toLowerCase()}`} />
      )}
      {weekRain !== null && (
        <Stat
          label={t("ui.rainWeek")}
          value={fmtMm(weekRain)}
          note={gaugeTotal !== null ? `${t("ui.gauge")}: ${fmtMm(gaugeTotal)}` : t("ui.satelliteRain")}
        />
      )}
      {periodAlerts.length > 0 && <Stat label={t("ui.alertsTitle")} value={periodAlerts.length} />}
      {tasksDone > 0 && <Stat label={t("ui.reportTasksDone")} value={tasksDone} />}
      {tasksLate > 0 && <Stat label={t("ui.reportTasksOverdue")} value={tasksLate} tone="danger" />}
    </div>
  );
}

/** Registros por tipo y autor, lluvia diaria y alertas del período. */
export function ReportCharts({ d }: { d: ReportData }) {
  const { byKind, byAuthor, hasRainDays, rainDays, periodAlerts } = d;
  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-8">
        {byKind.length > 0 && (
          <Block title={t("ui.reportByKind")}>
            <BarList items={byKind} ariaLabel={t("ui.reportByKind")} />
          </Block>
        )}
        {byAuthor.length > 1 && (
          <Block title={t("ui.reportByAuthor")}>
            <BarList items={byAuthor} ariaLabel={t("ui.reportByAuthor")} />
          </Block>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-8">
        {hasRainDays && (
          <Block title={t("ui.reportRainDaily")}>
            <RainChart
              days={rainDays}
              labels={{ satellite: t("ui.satelliteRain"), normal: t("ui.rainNormal"), gauge: t("ui.gauge") }}
              formatDate={(d) => fmtIsoDate(d).slice(0, 5)}
              ariaLabel={t("ui.reportRainDaily")}
            />
          </Block>
        )}
        {periodAlerts.length > 0 && (
          <Block title={t("ui.alertsTitle")}>
            <ul className="flex flex-col text-sm">
              {periodAlerts.map((a) => (
                <li key={a.id} className="border-b border-linea py-2.5">
                  <span className="font-medium">{tk(`ui.alertKind_${a.kind}`)}</span>
                  <span className="text-tinta-2"> · {tk(`ui.severity_${a.severity}`)}</span>
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
        title={t("ui.reportHighlights")}
        count={rows.length}
        action={
          <Link to="/registros" className="text-meta text-tinta-2 underline-offset-4 hover:text-surco hover:underline">
            {t("ui.reportAllRecords")}
          </Link>
        }
      />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} />
    </section>
  );
}
