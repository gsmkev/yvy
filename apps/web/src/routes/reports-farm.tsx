/** Informes de una estancia: campaña por lote (R-03), informe para el banco (R-04) y exportación completa (R-09). */
import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { FarmPageHeader } from "../components/FarmPageHeader";
import { localDate } from "@yvy/shared";
import { ReportSchedules } from "../components/ReportSchedules";
import { Button, ErrorBox, Field, Select, Spinner } from "../components/ui";
import { download } from "../lib/exports";
import { buildExportZip, collectExportData } from "../lib/reportsExport";
import { t } from "../lib/i18n";
import { get } from "../lib/api";
import { fetchAllRecords, useFarm, useMe } from "../lib/queries";
import type { Alert, Poi, Product } from "../lib/types";
import { buildAuditReport } from "../lib/auditReportData";
import {
  fetchClimate,
  fetchNdvi,
  gaugeBetween,
  mapLimit,
  normalBetween,
  rainBetween,
  seasonStart,
  vigorSummary,
} from "../lib/reportsData";

function Row({ title, text, stack = false, children }: { title: string; text: string; stack?: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex flex-col gap-3 py-4 ${stack ? "" : "sm:flex-row sm:items-center sm:justify-between sm:gap-6"}`}>
      <div className="min-w-0">
        <h2 className="text-[18px] leading-6 font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-tinta-2">{text}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-end gap-3">{children}</div>
    </li>
  );
}

export function FarmReportsPage() {
  const { farmId } = useParams({ from: "/app/estancias/$farmId/informes" });
  const farm = useFarm(farmId);
  const [plotId, setPlotId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [progress, setProgress] = useState("");
  const me = useMe();

  if (farm.isLoading) return <Spinner />;
  if (farm.error || !farm.data) return <ErrorBox error={farm.error} />;
  const { farm: f, plots } = farm.data;
  const plot = plots.find((p) => p.id === (plotId || plots[0]?.id));

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await job();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const seasonPdf = () =>
    run(async () => {
      if (!plot) return;
      const to = localDate(Date.now());
      const from = seasonStart(plot.sowingDate, to);
      const days = Math.ceil((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 2;
      const fromMs = Date.parse(`${from}T00:00:00-03:00`);
      const toMs = Date.parse(`${to}T23:59:59-03:00`);
      const [records, climate, ndvi] = await Promise.all([
        fetchAllRecords({ farmId, plotId: plot.id, from: fromMs, to: toMs }, 2000),
        fetchClimate(farmId, days),
        fetchNdvi(plot.id),
      ]);
      const [{ pdf }, { SeasonReport }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("../lib/reportsPdf"),
      ]);
      const blob = await pdf(
        <SeasonReport
          farm={f}
          plot={plot}
          from={from}
          to={to}
          records={records}
          rainMm={rainBetween(climate.daily, from, to)}
          normalMm={normalBetween(climate.climatology, from, to)}
          gaugeMm={gaugeBetween(climate.gauge, fromMs, toMs)}
          ndvi={ndvi.series.filter((p) => p.acquiredAt >= fromMs)}
        />,
      ).toBlob();
      download(blob, `campana-${plot.name}-${to}.pdf`);
    });

  /** R-05: aplicaciones del año con productos, dosis, carencia, distancia a agua o vivienda y operadores. */
  const auditPdf = () =>
    run(async () => {
      const to = localDate(Date.now());
      const from = `${to.slice(0, 4)}-01-01`;
      const fromMs = Date.parse(`${from}T00:00:00-03:00`);
      const toMs = Date.parse(`${to}T23:59:59-03:00`);
      const [applications, harvests, products] = await Promise.all([
        fetchAllRecords({ farmId, kind: "application", from: fromMs, to: toMs }, 2000),
        fetchAllRecords({ farmId, kind: "harvest", from: fromMs, to: toMs }, 500),
        get<Product[]>("/org/products"),
      ]);
      const data = buildAuditReport({ from, to, applications, harvests, products, pois: farm.data!.pois as Poi[] });
      const [{ pdf }, { AuditReport }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("../lib/auditReportPdf"),
      ]);
      const blob = await pdf(<AuditReport {...data} farm={f} generatedAt={Date.now()} />).toBlob();
      download(blob, `auditoria-${f.name}-${to}.pdf`);
    });

  const exportZip = () =>
    run(async () => {
      const data = await collectExportData(me.data?.organization.name ?? "Yvy", (farm) =>
        setProgress(t("ui.exportWorking", { farm })),
      );
      download(await buildExportZip(data), `yvy-exportacion-${localDate(Date.now())}.zip`);
      setProgress("");
    });

  const bankPdf = () =>
    run(async () => {
      const to = localDate(Date.now());
      const sowings = plots.filter((p) => p.kind === "crop" && p.sowingDate).map((p) => p.sowingDate!);
      const seasonFrom = seasonStart(sowings.length ? sowings.sort()[0]! : null, to);
      const days = Math.ceil((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${seasonFrom}T00:00:00Z`)) / 86_400_000) + 2;
      const from30 = new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
      const [climate, alerts, series] = await Promise.all([
        fetchClimate(farmId, Math.max(days, 31)),
        get<Alert[]>(`/org/alerts?farmId=${farmId}&active=1`),
        mapLimit(plots.slice(0, 80), 6, (p) => fetchNdvi(p.id).catch(() => null)),
      ]);
      const since = Date.now() - 365 * 86_400_000;
      const vigor = new Map(
        plots.slice(0, 80).map((p, i) => [p.id, vigorSummary((series[i]?.series ?? []).filter((x) => x.acquiredAt >= since))]),
      );
      const [{ pdf }, { BankReport }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("../lib/reportsBankPdf"),
      ]);
      const blob = await pdf(
        <BankReport
          farm={f}
          plots={plots}
          vigor={vigor}
          rain30={rainBetween(climate.daily, from30, to)}
          normal30={normalBetween(climate.climatology, from30, to)}
          rainSeason={rainBetween(climate.daily, seasonFrom, to)}
          normalSeason={normalBetween(climate.climatology, seasonFrom, to)}
          seasonFrom={seasonFrom}
          to={to}
          alerts={alerts}
          generatedAt={Date.now()}
        />,
      ).toBlob();
      download(blob, `informe-banco-${f.name}-${to}.pdf`);
    });

  const openCls =
    "inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-linea bg-papel px-3.5 text-sm font-medium text-surco transition-colors hover:border-tinta-2/40 hover:bg-lino";
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 lg:p-6">
      <FarmPageHeader farmId={farmId} farmName={f.name} title={t("ui.reportsTitle")} />
      <ul className="divide-y divide-linea border-y border-linea">
        <Row stack title={t("ui.seasonReportTitle")} text={t("ui.reportsSeasonIntro")}>
          <Field label={t("ui.reportsPickPlot")}>
            <Select
              value={plot?.id ?? ""}
              onChange={(e) => setPlotId(e.target.value)}
              options={plots.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Button onClick={seasonPdf} disabled={busy || !plot}>
            {busy ? t("ui.reportsGenerating") : t("ui.reportsSeasonPdf")}
          </Button>
        </Row>
        <Row title={t("ui.bankReportTitle")} text={t("ui.reportsBankIntro")}>
          <Button onClick={bankPdf} disabled={busy}>
            {busy ? t("ui.reportsGenerating") : t("ui.reportsBankPdf")}
          </Button>
        </Row>
        <Row title={t("ui.auditReportTitle")} text={t("ui.auditReportIntro")}>
          <Button onClick={auditPdf} disabled={busy}>
            {busy ? t("ui.reportsGenerating") : t("ui.auditReportPdf")}
          </Button>
        </Row>
        <Row title={t("ui.riskTitle")} text={t("ui.riskAppText")}>
          <Link to="/estancias/$farmId/riesgo" params={{ farmId }} aria-label={t("ui.riskLink")} className={openCls}>
            {t("ui.reportsOpen")}
          </Link>
        </Row>
        <Row title={t("ui.eudrTitle")} text={t("ui.eudrLandingText")}>
          <Link to="/estancias/$farmId/eudr" params={{ farmId }} aria-label={t("ui.eudrLink")} className={openCls}>
            {t("ui.reportsOpen")}
          </Link>
        </Row>
        <Row title={t("ui.changesTitle")} text={t("ui.changesLandingText")}>
          <Link to="/estancias/$farmId/cambios" params={{ farmId }} aria-label={t("ui.changesLink")} className={openCls}>
            {t("ui.reportsOpen")}
          </Link>
        </Row>
        {me.data?.role === "owner" && (
          <Row title={t("ui.exportTitle")} text={t("ui.exportIntro")}>
            {busy && progress && <span className="text-sm text-tinta-2">{progress}</span>}
            <Button onClick={exportZip} disabled={busy}>
              {t("ui.exportDownload")}
            </Button>
          </Row>
        )}
      </ul>
      {(me.data?.role === "owner" || me.data?.role === "admin") && <ReportSchedules farmId={farmId} />}
      {error ? <ErrorBox error={error} /> : null}
    </div>
  );
}
