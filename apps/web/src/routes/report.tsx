import { FileDown } from "lucide-react";
import { useState } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { addDays, localDate, weeklyShareText } from "@yvy/shared";
import { ShareWhatsappButton } from "../components/ShareButton";
import { ShareLinksSection } from "../components/ShareLinks";
import { Button, Card, ErrorBox, Field, Input, Spinner } from "../components/ui";
import { get } from "../lib/api";
import { download } from "../lib/exports";
import { fmtIsoDate } from "../lib/format";
import { t } from "../lib/i18n";
import { fetchAllRecords, useAlerts, useFarm } from "../lib/queries";

export function ReportPage() {
  const { farmId } = useParams({ from: "/app/estancias/$farmId/parte" });
  const search = useSearch({ from: "/app/estancias/$farmId/parte" });
  const today = localDate(Date.now());
  const [from, setFrom] = useState(search.desde ?? addDays(today, -7));
  const [to, setTo] = useState(search.hasta ?? today);
  const farm = useFarm(farmId);
  const alerts = useAlerts({ farmId });
  const fromMs = Date.parse(`${from}T00:00:00-03:00`);
  const toMs = Date.parse(`${to}T23:59:59-03:00`);
  const records = useQuery({
    queryKey: ["report-records", farmId, from, to],
    queryFn: () => fetchAllRecords({ farmId, from: fromMs, to: toMs }, 2000),
  });
  const climate = useQuery({
    queryKey: ["climate", farmId, 30],
    queryFn: () =>
      get<{
        daily: { date: string; source: string; precipMm: number | null }[];
        gauge: { capturedAt: number; mm: number }[];
      }>(`/org/farms/${farmId}/climate?days=30`),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (farm.isLoading || records.isLoading) return <Spinner />;
  if (farm.error || records.error) return <ErrorBox error={farm.error ?? records.error} />;
  const rows = records.data!;
  const weekRain = (() => {
    const byDate = new Map<string, number>();
    for (const d of climate.data?.daily ?? []) {
      if (d.date < from || d.date > to || d.precipMm === null) continue;
      if (d.source === "chirps" || !byDate.has(d.date)) byDate.set(d.date, d.precipMm);
    }
    return byDate.size ? [...byDate.values()].reduce((a, b) => a + b, 0) : null;
  })();
  const gauge = (climate.data?.gauge ?? []).filter((g) => g.capturedAt >= fromMs && g.capturedAt <= toMs);
  const periodAlerts = (alerts.data ?? []).filter((a) => a.validFrom <= toMs && (a.validTo ?? a.validFrom) >= fromMs);

  const shareText = weeklyShareText({
    farmName: farm.data!.farm.name,
    from: fmtIsoDate(from),
    to: fmtIsoDate(to),
    records: rows.length,
    workers: new Set(rows.map((r) => r.authorId)).size,
    rainMm: weekRain,
    alerts: periodAlerts.map((a) => a.summary),
    link: `${window.location.origin}/estancias/${farmId}/parte?desde=${from}&hasta=${to}`,
  });

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const withPhotos = rows.filter((r) => r.attachments.some((a) => a.uploadStatus === "uploaded")).slice(0, 6);
      const photoUrls = (
        await Promise.all(
          withPhotos.map((r) =>
            get<{ url: string }>(
              `/media/attachments/${r.attachments.find((a) => a.uploadStatus === "uploaded")!.id}`,
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
          farm={farm.data!.farm}
          plots={farm.data!.plots}
          records={[...rows].reverse()}
          alerts={periodAlerts}
          rainMm={weekRain}
          gaugeMm={gauge.length ? gauge.reduce((a, g) => a + g.mm, 0) : null}
          from={from}
          to={to}
          photoUrls={photoUrls}
        />,
      ).toBlob();
      download(blob, `parte-${farm.data!.farm.name}-${from}.pdf`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
      <h1 className="text-xl font-semibold">
        {t("ui.reportTitle")} · {farm.data!.farm.name}
      </h1>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("ui.from")}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t("ui.to")}>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button variant="primary" icon={FileDown} onClick={generate} disabled={busy}>
          {t("ui.downloadPdf")}
        </Button>
        <ShareWhatsappButton text={shareText} />
      </div>
      {error ? <ErrorBox error={error} /> : null}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <div className="eyebrow">{t("ui.navRecords")}</div>
          <div className="text-2xl font-semibold">{rows.length}</div>
        </Card>
        <Card>
          <div className="eyebrow">{t("ui.rainWeek")}</div>
          <div className="text-2xl font-semibold">{weekRain === null ? "—" : `${Math.round(weekRain)} mm`}</div>
        </Card>
        <Card>
          <div className="eyebrow">{t("ui.alertsTitle")}</div>
          <div className="text-2xl font-semibold">{periodAlerts.length}</div>
        </Card>
      </div>
      <ShareLinksSection farmId={farmId} />
    </div>
  );
}
