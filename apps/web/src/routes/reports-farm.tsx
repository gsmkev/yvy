/** Informes de una estancia: campaña por lote, informe para el banco y exportación completa. */
import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { localDate, gaugeBetween, normalBetween, rainBetween } from "@yvy/shared";
import { ActionMenu } from "../components/menus";
import { ReportSchedules } from "../components/ReportSchedules";
import { ShareLinksModal } from "../components/ShareLinks";
import { Button, ErrorBox, Page, Select, SectionHead, Spinner } from "../components/ui";
import { download } from "../lib/exports";
import { buildExportZip, collectExportData } from "../lib/reportsExport";
import { t } from "../lib/i18n";
import { get } from "../lib/api";
import { fetchAllRecords, useFarm, useFarms, useMe } from "../lib/queries";
import type { Alert, Poi, Product } from "../lib/types";
import { buildAuditReport } from "../lib/auditReportData";
import { fetchClimate, fetchNdvi, mapLimit, seasonStart, vigorSummary } from "../lib/reportsData";

const openCls =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-linea bg-papel px-2.5 text-meta font-medium text-surco transition-colors hover:border-tinta-2/40 hover:bg-lino";

/** Una entrada del centro: título, una línea y una sola acción a la derecha. */
function Entry({ title, text, extra, action }: { title: string; text: string; extra?: React.ReactNode; action: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-linea py-3">
      <div className="min-w-0">
        <h3 className="text-body font-medium">{title}</h3>
        <p className="text-meta text-tinta-2">{text}</p>
        {extra && <div className="mt-2 max-w-[14rem]">{extra}</div>}
      </div>
      {action}
    </li>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <SectionHead title={title} />
      <ul className="grid gap-x-10 md:grid-cols-2">{children}</ul>
    </section>
  );
}

/** Informes de una estancia: campaña por lote, informe para el banco y exportación completa. */
export function FarmReportsPage() {
  const navigate = useNavigate();
  const farms = useFarms();
  const [sharing, setSharing] = useState(false);
  const { farmId } = useParams({ from: "/app/estancias/$farmId/informes" });
  const farm = useFarm(farmId);
  const [plotId, setPlotId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [progress, setProgress] = useState("");
  const me = useMe();

  if (farm.isLoading) return <Spinner />;
  if (farm.error || !farm.data) return <ErrorBox error={farm.error} />;
  const { farm: f, plots } = farm.data;
  const plot = plots.find((p) => p.id === (plotId || plots[0]?.id));

  const run = async (key: string, job: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await job();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const seasonPdf = () =>
    run("season", async () => {
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

  /** Aplicaciones del año con productos, dosis, carencia, distancia a agua o vivienda y operadores. */
  const auditPdf = () =>
    run("audit", async () => {
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
      const blob = await pdf(<AuditReport from={data.from} to={data.to} applications={data.applications} operators={data.operators} totalHa={data.totalHa} flagged={data.flagged} farm={f} generatedAt={Date.now()} />).toBlob();
      download(blob, `auditoria-${f.name}-${to}.pdf`);
    });

  const exportZip = () =>
    run("zip", async () => {
      const data = await collectExportData(me.data?.organization.name ?? "Yvy", (farm) =>
        setProgress(t("ui.export.working", { farm })),
      );
      download(await buildExportZip(data), `yvy-exportacion-${localDate(Date.now())}.zip`);
      setProgress("");
    });

  const bankPdf = () =>
    run("bank", async () => {
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

  const pdfBtn = (key: string, onClick: () => void, label: string, short = t("ui.reports.pdf")) => (
    <Button size="sm" variant="secondary" aria-label={label} onClick={onClick} disabled={busy !== null}>
      <Download size={14} aria-hidden />
      {busy === key ? t("ui.reports.generating") : short}
    </Button>
  );
  const open = (to: string, label: string) => (
    <Link to={to} params={{ farmId }} aria-label={label} className={openCls}>
      {t("ui.reports.open")}
    </Link>
  );
  const isOwner = me.data?.role === "owner";
  const canSchedule = isOwner || me.data?.role === "admin";
  const many = (farms.data?.length ?? 0) > 1;
  return (
    <Page
      width="data"
      title={t("ui.reports.title")}
      titleAction={
        many ? (
          <ActionMenu
            text={f.name}
            align="left"
            label={t("ui.farm.switch")}
            items={(farms.data ?? []).map((x) => ({
              label: x.name,
              disabled: x.id === farmId,
              onSelect: () => void navigate({ to: "/estancias/$farmId/informes", params: { farmId: x.id } }),
            }))}
          />
        ) : undefined
      }
      className="gap-6"
    >
      {!many && <p className="-mt-3 text-sm text-tinta-2">{f.name}</p>}
      <div className={`grid items-start gap-10 ${canSchedule ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : ""}`}>
        <div className="flex min-w-0 flex-col gap-8">
          <Group title={t("ui.reports.groupTrack")}>
            <Entry
              title={t("ui.report.title")}
              text={t("ui.reports.descWeekly")}
              action={
                <Link
                  to="/estancias/$farmId/parte"
                  params={{ farmId }}
                  search={{ desde: undefined, hasta: undefined }}
                  aria-label={t("ui.report.title")}
                  className={openCls}
                >
                  {t("ui.reports.open")}
                </Link>
              }
            />
            <Entry title={t("ui.gauges.title")} text={t("ui.reports.descGauges")} action={open("/estancias/$farmId/pluviometros", t("ui.gauges.link"))} />
            <Entry title={t("ui.changes.title")} text={t("ui.reports.descChanges")} action={open("/estancias/$farmId/cambios", t("ui.changes.link"))} />
          </Group>
          <Group title={t("ui.reports.groupThird")}>
            <Entry title={t("ui.bank.reportTitle")} text={t("ui.reports.descBank")} action={pdfBtn("bank", bankPdf, t("ui.reports.bankPdf"))} />
            <Entry title={t("ui.audit.reportTitle")} text={t("ui.reports.descAudit")} action={pdfBtn("audit", auditPdf, t("ui.audit.reportPdf"))} />
            <Entry title={t("ui.eudr.title")} text={t("ui.reports.descEudr")} action={open("/estancias/$farmId/eudr", t("ui.eudr.link"))} />
            {isOwner && (
              <Entry
                title={t("ui.share.linkTitle")}
                text={t("ui.reports.descShare")}
                action={
                  <Button size="sm" variant="secondary" aria-label={t("ui.share.linkTitle")} onClick={() => setSharing(true)}>
                    {t("ui.reports.open")}
                  </Button>
                }
              />
            )}
          </Group>
          <Group title={t("ui.reports.groupSeason")}>
            {plot && (
              <Entry
                title={t("ui.season.reportTitle")}
                text={t("ui.reports.descSeason")}
                extra={
                  plots.length > 1 ? (
                    <Select
                      aria-label={t("ui.reports.pickPlot")}
                      value={plot.id}
                      onChange={(e) => setPlotId(e.target.value)}
                      options={plots.map((p) => ({ value: p.id, label: p.name }))}
                    />
                  ) : undefined
                }
                action={pdfBtn("season", seasonPdf, t("ui.reports.seasonPdf"))}
              />
            )}
            <Entry title={t("ui.risk.title")} text={t("ui.reports.descRisk")} action={open("/estancias/$farmId/riesgo", t("ui.risk.link"))} />
          </Group>
          {isOwner && (
            <Group title={t("ui.reports.groupData")}>
              <Entry
                title={t("ui.export.title")}
                text={busy === "zip" && progress ? progress : t("ui.reports.descExport")}
                action={pdfBtn("zip", exportZip, t("ui.export.download"), "ZIP")}
              />
            </Group>
          )}
        </div>
        {canSchedule && (
          <aside className="flex flex-col gap-1">
            <SectionHead title={t("ui.reports.autoSend")} />
            <ReportSchedules farmId={farmId} />
          </aside>
        )}
      </div>
      {error ? <ErrorBox error={error} /> : null}
      {sharing && <ShareLinksModal farmId={farmId} onClose={() => setSharing(false)} />}
    </Page>
  );
}
