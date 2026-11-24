import { useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { addDays, localDate, mondayOf, weeklyShareText, whatsappUrl } from "@yvy/shared";
import { ActionMenu } from "../components/menus";
import { ShareLinksModal } from "../components/ShareLinks";
import { Button, EmptyState, ErrorBox, Field, FilterBar, Input, Page, Spinner, type Column } from "../components/ui";
import { describeData } from "../lib/exports";
import { fmtDateTime, fmtIsoDate } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useMe } from "../lib/queries";
import type { RecordRow } from "../lib/types";
import { generateReportPdf } from "./report/generateReportPdf";
import { ReportCharts, ReportHighlights, ReportStats } from "./report/ReportSummary";
import { useReportData } from "./report/useReportData";

const columns: Column<RecordRow>[] = [
  { id: "at", header: t("ui.capturedAt"), cell: (r) => fmtDateTime(r.capturedAt), width: "9rem" },
  { id: "kind", header: t("ui.kind"), cell: (r) => tk(`recordKinds.${r.kind}`) },
  { id: "plot", header: t("ui.plot"), cell: (r) => r.plotName ?? "—", hideBelow: "sm" },
  { id: "author", header: t("ui.author"), cell: (r) => r.authorName ?? "—", hideBelow: "md" },
  { id: "data", header: "", cell: (r) => <span className="text-tinta-2">{describeData(r.kind, r.data)}</span>, hideBelow: "lg" },
];

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
      back={{ to: `/estancias/${farmId}/informes`, label: t("ui.reportsBack") }}
      title={t("ui.reportTitle")}
      primary={
        <Button variant="primary" onClick={generate} disabled={busy} aria-label={t("ui.downloadPdf")}>
          <span className="sm:hidden">PDF</span>
          <span className="hidden sm:inline">{t("ui.downloadPdf")}</span>
        </Button>
      }
      menu={
        <ActionMenu
          label={t("ui.reportShare")}
          items={[
            { label: t("ui.shareWhatsapp"), onSelect: () => window.open(whatsappUrl(shareText), "_blank", "noopener") },
            me.data?.role === "owner" && { label: t("ui.shareLinkTitle"), onSelect: () => setSharing(true) },
          ]}
        />
      }
      className="gap-6"
    >
      <p className="-mt-3 text-sm text-tinta-2">{farm.data.farm.name}</p>
      <FilterBar>
        <Field label={t("ui.from")}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t("ui.to")}>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        {quick(t("ui.reportThisWeek"), thisMonday, today)}
        {quick(t("ui.reportLastWeek"), addDays(thisMonday, -7), addDays(thisMonday, -1))}
      </FilterBar>
      {error ? <ErrorBox error={error} /> : null}
      <ReportStats d={d} />
      {rows.length === 0 && weekRain === null && periodAlerts.length === 0 && (
        <EmptyState title={t("ui.reportNoRecords")}>{t("ui.reportNoRecordsHint")}</EmptyState>
      )}
      <ReportCharts d={d} />
      {d.highlights.length > 0 && (
        <ReportHighlights rows={d.highlights} columns={columns} onRowClick={() => void navigate({ to: "/registros" })} />
      )}
      {sharing && <ShareLinksModal farmId={farmId} onClose={() => setSharing(false)} />}
    </Page>
  );
}
