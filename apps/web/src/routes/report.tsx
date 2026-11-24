import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { addDays, isAudioMime, localDate, mondayOf, weeklyShareText, whatsappUrl } from "@yvy/shared";
import { BarList } from "../components/BarList";
import { RainChart } from "../components/charts";
import { ActionMenu } from "../components/menus";
import { ShareLinksModal } from "../components/ShareLinks";
import { Button, DataTable, EmptyState, ErrorBox, Field, FilterBar, Input, Page, SectionHead, Spinner, Stat, type Column } from "../components/ui";
import { get } from "../lib/api";
import { describeData, download } from "../lib/exports";
import { fmtDateTime, fmtIsoDate, fmtMm } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { fetchAllRecords, useAlerts, useFarm, useMe, useTasks } from "../lib/queries";
import type { RecordRow } from "../lib/types";

const isUploadedPhoto = (a: { uploadStatus: string; mime?: string }) => a.uploadStatus === "uploaded" && !isAudioMime(a.mime ?? "");

/** Tipos que conviene mirar primero en el parte. */
const HIGHLIGHT_KINDS = ["pest", "mortality", "theft"];
const DAY = 86_400_000;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <SectionHead title={title} />
      {children}
    </section>
  );
}

export function ReportPage() {
  const { farmId } = useParams({ from: "/app/estancias/$farmId/parte" });
  const search = useSearch({ from: "/app/estancias/$farmId/parte" });
  const navigate = useNavigate();
  const me = useMe();
  const today = localDate(Date.now());
  const [from, setFrom] = useState(search.desde ?? addDays(today, -7));
  const [to, setTo] = useState(search.hasta ?? today);
  const [sharing, setSharing] = useState(false);
  const farm = useFarm(farmId);
  const alerts = useAlerts({ farmId });
  const tasks = useTasks({ farmId });
  const fromMs = Date.parse(`${from}T00:00:00-03:00`);
  const toMs = Date.parse(`${to}T23:59:59-03:00`);
  const records = useQuery({
    queryKey: ["report-records", farmId, from, to],
    queryFn: () => fetchAllRecords({ farmId, from: fromMs, to: toMs }, 2000),
  });
  const climateDays = Math.min(400, Math.max(30, Math.ceil((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 2));
  const climate = useQuery({
    queryKey: ["climate", farmId, climateDays],
    queryFn: () =>
      get<{
        daily: { date: string; source: string; precipMm: number | null }[];
        gauge: { capturedAt: number; mm: number }[];
      }>(`/org/farms/${farmId}/climate?days=${climateDays}`),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const rows = records.data ?? [];

  const byKind = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.kind, (m.get(r.kind) ?? 0) + 1);
    return [...m].map(([k, value]) => ({ label: tk(`recordKinds.${k}`), value })).sort((a, b) => b.value - a.value);
  }, [rows]);
  const byAuthor = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.authorName ?? "—", (m.get(r.authorName ?? "—") ?? 0) + 1);
    return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [rows]);

  if (farm.isLoading || records.isLoading) return <Spinner />;
  if (farm.error || records.error || !farm.data) return <ErrorBox error={farm.error ?? records.error} />;

  const byDate = new Map<string, number>();
  for (const d of climate.data?.daily ?? []) {
    if (d.date < from || d.date > to || d.precipMm === null) continue;
    if (d.source === "chirps" || !byDate.has(d.date)) byDate.set(d.date, d.precipMm);
  }
  const weekRain = byDate.size ? [...byDate.values()].reduce((a, b) => a + b, 0) : null;
  const gauge = (climate.data?.gauge ?? []).filter((g) => g.capturedAt >= fromMs && g.capturedAt <= toMs);
  const gaugeTotal = gauge.length ? gauge.reduce((a, g) => a + g.mm, 0) : null;
  const gaugeByDay = new Map<string, number>();
  for (const g of gauge) {
    const d = localDate(g.capturedAt);
    gaugeByDay.set(d, (gaugeByDay.get(d) ?? 0) + g.mm);
  }
  const rainDays: { date: string; mm: number | null; gauge: number | null }[] = [];
  for (let d = from; d <= to && rainDays.length < 62; d = addDays(d, 1)) {
    rainDays.push({ date: d, mm: byDate.get(d) ?? null, gauge: gaugeByDay.get(d) ?? null });
  }
  const hasRainDays = rainDays.some((d) => (d.mm ?? 0) > 0 || (d.gauge ?? 0) > 0);
  const periodAlerts = (alerts.data ?? []).filter((a) => a.validFrom <= toMs && (a.validTo ?? a.validFrom) >= fromMs);
  const tasksDone = (tasks.data ?? []).filter((x) => x.status === "done" && x.completedAt !== null && x.completedAt >= fromMs && x.completedAt <= toMs).length;
  const tasksLate = (tasks.data ?? []).filter((x) => x.status === "open" && x.dueDate <= to && x.dueDate < today).length;
  const highlights = rows.filter((r) => HIGHLIGHT_KINDS.includes(r.kind));
  const workers = new Set(rows.map((r) => r.authorId)).size;

  const shareText = weeklyShareText({
    farmName: farm.data.farm.name,
    from: fmtIsoDate(from),
    to: fmtIsoDate(to),
    records: rows.length,
    workers,
    rainMm: weekRain,
    alerts: periodAlerts.map((a) => a.summary),
    link: `${window.location.origin}/estancias/${farmId}/parte?desde=${from}&hasta=${to}`,
  });

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const withPhotos = rows.filter((r) => r.attachments.some(isUploadedPhoto)).slice(0, 6);
      const photoUrls = (
        await Promise.all(
          withPhotos.map((r) =>
            get<{ url: string }>(
              `/media/attachments/${r.attachments.find(isUploadedPhoto)!.id}`,
            ).catch(() => null),
          ),
        )
      )
        .filter(Boolean)
        .map((x) => x!.url);
      const [{ pdf }, { WeeklyReport }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("../lib/reportPdf"),
      ]);
      const blob = await pdf(
        <WeeklyReport
          farm={farm.data.farm}
          plots={farm.data.plots}
          records={[...rows].reverse()}
          alerts={periodAlerts}
          rainMm={weekRain}
          gaugeMm={gaugeTotal}
          from={from}
          to={to}
          photoUrls={photoUrls}
        />,
      ).toBlob();
      download(blob, `parte-${farm.data.farm.name}-${from}.pdf`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<RecordRow>[] = [
    { id: "at", header: t("ui.capturedAt"), cell: (r) => fmtDateTime(r.capturedAt), width: "9rem" },
    { id: "kind", header: t("ui.kind"), cell: (r) => tk(`recordKinds.${r.kind}`) },
    { id: "plot", header: t("ui.plot"), cell: (r) => r.plotName ?? "—", hideBelow: "sm" },
    { id: "author", header: t("ui.author"), cell: (r) => r.authorName ?? "—", hideBelow: "md" },
    { id: "data", header: "", cell: (r) => <span className="text-tinta-2">{describeData(r.kind, r.data)}</span>, hideBelow: "lg" },
  ];
  const setWeek = (start: string, end: string) => {
    setFrom(start);
    setTo(end);
  };
  const thisMonday = mondayOf(today);
  const sameRange = (a: string, b: string) => from === a && to === b;

  const quick = (label: string, a: string, b: string) => (
    <Button size="sm" variant={sameRange(a, b) ? "primary" : "secondary"} className="mb-1" onClick={() => setWeek(a, b)}>
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
      {rows.length === 0 && weekRain === null && periodAlerts.length === 0 && (
        <EmptyState title={t("ui.reportNoRecords")}>{t("ui.reportNoRecordsHint")}</EmptyState>
      )}
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
      {highlights.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHead
            title={t("ui.reportHighlights")}
            count={highlights.length}
            action={
              <Link to="/registros" className="text-meta text-tinta-2 underline-offset-4 hover:text-surco hover:underline">
                {t("ui.reportAllRecords")}
              </Link>
            }
          />
          <DataTable columns={columns} rows={highlights} rowKey={(r) => r.id} onRowClick={() => void navigate({ to: "/registros" })} />
        </section>
      )}
      {sharing && <ShareLinksModal farmId={farmId} onClose={() => setSharing(false)} />}
    </Page>
  );
}
