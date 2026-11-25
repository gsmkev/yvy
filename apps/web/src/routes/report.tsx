/** Parte de una estancia entre dos fechas, con su PDF. */
import { useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { addDays, localDate, mondayOf, weeklyShareText, whatsappUrl } from "@yvy/shared";
import { ActionMenu } from "../components/menus";
import { ShareLinksModal } from "../components/ShareLinks";
import { Button, DateRange, EmptyState, ErrorBox, FilterBar, Page, Spinner, type Column } from "../components/ui";
import { describeData } from "../lib/exports";
import { fmtDateTime, fmtIsoDate } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useMe } from "../lib/queries";
import type { RecordRow } from "../lib/types";
import { generateReportPdf } from "./report/generateReportPdf";
import { ReportCharts, ReportHighlights, ReportStats } from "./report/ReportSummary";
import { useReportData } from "./report/useReportData";

const columns: Column<RecordRow>[] = [
  { id: "at", header: t("ui.common.capturedAt"), cell: (r) => fmtDateTime(r.capturedAt), width: "9rem" },
  { id: "kind", mobile: "title", header: t("ui.common.kind"), cell: (r) => tk(`record-kinds.kind.${r.kind}`) },
  { id: "plot", header: t("ui.common.plot"), cell: (r) => r.plotName ?? "—", hideBelow: "sm" },
  { id: "author", header: t("ui.common.author"), cell: (r) => r.authorName ?? "—", hideBelow: "md" },
  { id: "data", header: "", cell: (r) => <span className="text-tinta-2">{describeData(r.kind, r.data)}</span>, hideBelow: "lg" },
];

/** Parte con registros, lluvia, avisos y tareas del período elegido; las fechas van en la URL. */
export function ReportPage() {
  const { farmId } = useParams({ from: "/app/estancias/$farmId/parte" });
  const search = useSearch({ from: "/app/estancias/$farmId/parte" });
  const navigate = useNavigate();
  const me = useMe();
  const today = localDate(Date.now());
  const [from, setFrom] = useState(search.desde ?? addDays(today, -7));
  const [to, setTo] = useState(search.hasta ?? today);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const d = useReportData(farmId, from, to);
  const { farm, records, rows, weekRain, periodAlerts } = d;

  if (farm.isLoading || records.isLoading) return <Spinner />;
  if (farm.error || records.error || !farm.data) return <ErrorBox error={farm.error ?? records.error} />;

  const shareText = weeklyShareText({
    farmName: farm.data.farm.name,
    from: fmtIsoDate(from),
    to: fmtIsoDate(to),
    records: rows.length,
    workers: d.workers,
    rainMm: weekRain,
    alerts: periodAlerts.map((a) => a.summary),
    link: `${window.location.origin}/estancias/${farmId}/parte?desde=${from}&hasta=${to}`,
  });
  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      await generateReportPdf(d, from, to);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const thisMonday = mondayOf(today);
  const quick = (label: string, a: string, b: string) => (
    <Button
      size="sm"
      variant={from === a && to === b ? "primary" : "secondary"}
      className="mb-1"
      onClick={() => {
        setFrom(a);
        setTo(b);
      }}
    >
      {label}
    </Button>
  );
  return (
    <Page
      width="data"
      back={{ to: `/estancias/${farmId}/informes`, label: t("ui.reports.back") }}
      title={t("ui.report.title")}
      primary={
        <Button variant="primary" onClick={generate} disabled={busy} aria-label={t("ui.download.pdf")}>
          <span className="sm:hidden">{t("ui.reports.pdf")}</span>
          <span className="hidden sm:inline">{t("ui.download.pdf")}</span>
        </Button>
      }
      menu={
        <ActionMenu
          label={t("ui.report.share")}
          items={[
            { label: t("ui.share.whatsapp"), onSelect: () => window.open(whatsappUrl(shareText), "_blank", "noopener") },
            me.data?.role === "owner" && { label: t("ui.share.linkTitle"), onSelect: () => setSharing(true) },
          ]}
        />
      }
      className="gap-6"
    >
      <p className="-mt-3 text-sm text-tinta-2">{farm.data.farm.name}</p>
      <FilterBar sheet={false} exportSlot={false}>
        <DateRange
          from={from}
          to={to}
          onChange={(r) => {
            setFrom(r.from);
            setTo(r.to);
          }}
        />
        {quick(t("ui.report.thisWeek"), thisMonday, today)}
        {quick(t("ui.report.lastWeek"), addDays(thisMonday, -7), addDays(thisMonday, -1))}
      </FilterBar>
      {error ? <ErrorBox error={error} /> : null}
      <ReportStats d={d} />
      {rows.length === 0 && weekRain === null && periodAlerts.length === 0 && (
        <EmptyState title={t("ui.report.noRecords")}>{t("ui.report.noRecordsHint")}</EmptyState>
      )}
      <ReportCharts d={d} />
      {d.highlights.length > 0 && (
        <ReportHighlights rows={d.highlights} columns={columns} onRowClick={() => void navigate({ to: "/registros" })} />
      )}
      {sharing && <ShareLinksModal farmId={farmId} onClose={() => setSharing(false)} />}
    </Page>
  );
}
