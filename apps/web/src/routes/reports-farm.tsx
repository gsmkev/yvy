/** Informes de una estancia: campaña por lote, informe para el banco y exportación completa. */
import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { localDate } from "@yvy/shared";
import { ActionMenu } from "../components/menus";
import { ReportSchedules } from "../components/ReportSchedules";
import { ShareLinksModal } from "../components/ShareLinks";
import { Button, ErrorBox, Page, Select, SectionHead, Spinner } from "../components/ui";
import { download } from "../lib/exports";
import { buildExportZip, collectExportData } from "../lib/reportsExport";
import { t } from "../lib/i18n";
import { useFarm, useFarms, useMe } from "../lib/queries";
import type { Plot, Poi } from "../lib/types";
import { auditPdf, bankPdf, seasonPdf } from "./reports-farm/reportJobs";

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

/** Selector de estancia junto al título. */
function FarmSwitch({ farmId, name, farms }: { farmId: string; name: string; farms: { id: string; name: string }[] }) {
  const navigate = useNavigate();
  return (
    <ActionMenu
      text={name}
      align="left"
      label={t("ui.farm.switch")}
      items={farms.map((x) => ({
        label: x.name,
        disabled: x.id === farmId,
        onSelect: () => void navigate({ to: "/estancias/$farmId/informes", params: { farmId: x.id } }),
      }))}
    />
  );
}

/** Enlace al parte semanal de la estancia. */
function WeeklyLink({ farmId }: { farmId: string }) {
  return (
    <Link
      to="/estancias/$farmId/parte"
      params={{ farmId }}
      search={{ desde: undefined, hasta: undefined }}
      aria-label={t("ui.report.title")}
      className={openCls}
    >
      {t("ui.reports.open")}
    </Link>
  );
}

/** Datos y acciones que comparten los grupos de informes. */
interface GroupsCtx {
  farmId: string;
  /** Clave del trabajo en curso, o null. */
  busy: string | null;
  /** Avance de la exportación completa. */
  progress: string;
  plots: Plot[];
  /** Lote elegido para el informe de campaña. */
  plot: Plot | undefined;
  isOwner: boolean;
  jobs: { bankJob: () => void; auditJob: () => void; seasonJob: () => void; exportZip: () => void };
  onShare: () => void;
  onPlot: (id: string) => void;
}

/** Los grupos de informes: seguimiento, para terceros, campaña y datos. */
function ReportGroups({ c }: { c: GroupsCtx }) {
  const { farmId, busy, plot, plots, isOwner, jobs } = c;
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
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <Group title={t("ui.reports.groupTrack")}>
        <Entry
          title={t("ui.report.title")}
          text={t("ui.reports.descWeekly")}
          action={<WeeklyLink farmId={farmId} />}
        />
        <Entry title={t("ui.gauges.title")} text={t("ui.reports.descGauges")} action={open("/estancias/$farmId/pluviometros", t("ui.gauges.link"))} />
        <Entry title={t("ui.changes.title")} text={t("ui.reports.descChanges")} action={open("/estancias/$farmId/cambios", t("ui.changes.link"))} />
      </Group>
      <Group title={t("ui.reports.groupThird")}>
        <Entry title={t("ui.bank.reportTitle")} text={t("ui.reports.descBank")} action={pdfBtn("bank", jobs.bankJob, t("ui.reports.bankPdf"))} />
        <Entry title={t("ui.audit.reportTitle")} text={t("ui.reports.descAudit")} action={pdfBtn("audit", jobs.auditJob, t("ui.audit.reportPdf"))} />
        <Entry title={t("ui.eudr.title")} text={t("ui.reports.descEudr")} action={open("/estancias/$farmId/eudr", t("ui.eudr.link"))} />
        {isOwner && (
          <Entry
            title={t("ui.share.linkTitle")}
            text={t("ui.reports.descShare")}
            action={
              <Button size="sm" variant="secondary" aria-label={t("ui.share.linkTitle")} onClick={c.onShare}>
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
                  onChange={(e) => c.onPlot(e.target.value)}
                  options={plots.map((p) => ({ value: p.id, label: p.name }))}
                />
              ) : undefined
            }
            action={pdfBtn("season", jobs.seasonJob, t("ui.reports.seasonPdf"))}
          />
        )}
        <Entry title={t("ui.risk.title")} text={t("ui.reports.descRisk")} action={open("/estancias/$farmId/riesgo", t("ui.risk.link"))} />
      </Group>
      {isOwner && (
        <Group title={t("ui.reports.groupData")}>
          <Entry
            title={t("ui.export.title")}
            text={busy === "zip" && c.progress ? c.progress : t("ui.reports.descExport")}
            action={pdfBtn("zip", jobs.exportZip, t("ui.export.download"), "ZIP")}
          />
        </Group>
      )}
    </div>
  );
}

/** Informes de una estancia: campaña por lote, informe para el banco y exportación completa. */
export function FarmReportsPage() {
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

  const seasonJob = () => run("season", () => plot ? seasonPdf(farmId, f, plot) : Promise.resolve());

  const auditJob = () => run("audit", () => auditPdf(farmId, f, farm.data!.pois as Poi[]));

  const exportZip = () =>
    run("zip", async () => {
      const data = await collectExportData(me.data?.organization.name ?? "Yvy", (farm) =>
        setProgress(t("ui.export.working", { farm })),
      );
      download(await buildExportZip(data), `yvy-exportacion-${localDate(Date.now())}.zip`);
      setProgress("");
    });

  const bankJob = () => run("bank", () => bankPdf(farmId, f, plots));

  const ctx: GroupsCtx = { farmId, busy, progress, plots, plot, isOwner: me.data?.role === "owner", jobs: { bankJob, auditJob, seasonJob, exportZip }, onShare: () => setSharing(true), onPlot: setPlotId };
  const many = (farms.data?.length ?? 0) > 1;
  const canSchedule = ctx.isOwner || me.data?.role === "admin";
  return (
    <Page width="data" title={t("ui.reports.title")} titleAction={many ? <FarmSwitch farmId={farmId} name={f.name} farms={farms.data ?? []} /> : undefined} className="gap-6">
      {!many && <p className="-mt-3 text-sm text-tinta-2">{f.name}</p>}
      <div className={`grid items-start gap-10 ${canSchedule ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : ""}`}>
        <ReportGroups c={ctx} />
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
