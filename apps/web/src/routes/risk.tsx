/** Informe de riesgo climático de la estancia: heladas, lluvia frente a lo normal, sequías y focos de calor. */
import { useRef, useState } from "react";
import { isFieldRole } from "@yvy/shared";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { CHART, type FarmRisk } from "@yvy/shared";
import { ColumnChart, MonthlyRainChart } from "../components/charts";
import { PageExport } from "../components/PageExport";
import { Button, DataTable, EmptyState, ErrorBox, SectionHead, Spinner, Stat, Page, type Column } from "../components/ui";
import { get } from "../lib/api";
import { download } from "../lib/exports";
import { fmtDate, fmtMm, fmtNum } from "../lib/format";
import { t } from "../lib/i18n";
import { useFarm, useMe } from "../lib/queries";
import { fireByMonth, fmtMmDd, rainByMonth, type RiskResponse } from "../lib/riskData";

function Section({ title, lead, wide = false, children }: { title: string; lead?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 ${wide ? "@3xl:col-span-2" : ""}`}>
      <div className="flex flex-col gap-1">
        <SectionHead title={title} />
        {lead && <p className="text-sm text-tinta-2">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 @3xl:grid-cols-2 @5xl:grid-cols-4">{children}</div>
);

type RainRow = ReturnType<typeof rainByMonth>[number];

/**
 * Cuerpo del informe de riesgo climático.
 * @param r riesgos calculados de la estancia.
 */
export function RiskReportBody({ r }: { r: FarmRisk }) {
  const rain = rainByMonth(r.rain);
  const fire = r.fire;
  const rainCols: Column<RainRow>[] = [
    { id: "m", header: t("ui.gauges.month"), cell: (m) => m.label },
    { id: "recent", header: t("ui.risk.rainRecent"), align: "right", cell: (m) => fmtMm(m.mm) },
    { id: "normal", header: t("ui.risk.rainNormal"), align: "right", cell: (m) => (m.normalMm === null ? "—" : fmtMm(m.normalMm)) },
    {
      id: "range",
      header: t("ui.risk.rainRange"),
      align: "right",
      hideBelow: "sm",
      cell: (m) => (m.p20Mm === null || m.p80Mm === null ? "—" : `${Math.round(m.p20Mm)} a ${Math.round(m.p80Mm)} mm`),
    },
  ];
  return (
    <div className="@container grid gap-x-10 gap-y-8 @3xl:grid-cols-2">
      <Section title={t("ui.risk.frostTitle")} lead={t("ui.risk.frostLead", { c: r.frost.thresholdC })}>
        <Grid>
          <Stat label={t("ui.risk.frostMean")} value={fmtNum(r.frost.meanPerYear)} unit="días" />
          {r.frost.worst && <Stat label={t("ui.risk.frostWorst")} value={r.frost.worst.days} unit="días" note={String(r.frost.worst.year)} />}
          <Stat label={t("ui.risk.frostYears")} value={r.frost.yearsWithFrostPct} unit="%" />
          <Stat
            label={t("ui.risk.frostFirst")}
            value={fmtMmDd(r.frost.typicalFirstFrost)}
            note={`${t("ui.risk.frostLast")}: ${fmtMmDd(r.frost.typicalLastFrost)}`}
          />
        </Grid>
        <div>
          <h3 className="eyebrow mb-2">{t("ui.risk.frostChart")}</h3>
          <ColumnChart
            ariaLabel={t("ui.risk.frostChart")}
            unit="días"
            every={3}
            color={CHART.comparison}
            items={r.frost.perYear.map((p) => ({ label: String(p.year), value: p.days }))}
          />
        </div>
      </Section>

      <Section title={t("ui.risk.dryTitle")} lead={t("ui.risk.dryLead", { mm: r.dry.thresholdMm })}>
        <Grid>
          <Stat label={t("ui.risk.dryMean")} value={fmtNum(r.dry.meanLongestDays)} unit="días" />
          {r.dry.worst && <Stat label={t("ui.risk.dryWorst")} value={r.dry.worst.days} unit="días" note={String(r.dry.worst.year)} />}
          <Stat label={t("ui.risk.drySummer")} value={fmtNum(r.dry.summerMeanLongestDays)} unit="días" />
          <Stat label={t("ui.risk.drySpells")} value={fmtNum(r.dry.spells15PerYear)} />
        </Grid>
      </Section>

      <Section title={t("ui.risk.rainTitle")} wide>
        <Stat label={t("ui.risk.rainAnnual")} value={fmtNum(r.rain.annualMeanMm)} unit="mm" />
        {rain.length > 0 ? (
          <div className="grid items-start gap-x-10 gap-y-5 @3xl:grid-cols-2">
            <MonthlyRainChart
              ariaLabel={t("ui.risk.rainTitle")}
              labels={{ gauge: t("ui.risk.rainRecent"), satellite: "", normal: t("ui.risk.rainNormal") }}
              months={rain.map((m) => ({ label: m.label, gauge: m.mm, sat: null, normal: m.normalMm }))}
            />
            <DataTable columns={rainCols} rows={rain} rowKey={(m) => m.key} caption={t("ui.risk.rainTitle")} />
          </div>
        ) : null}
      </Section>

      <Section
        title={t("ui.risk.fireTitle")}
        lead={fire ? t("ui.risk.fireLead", { km: fire.radiusKm, years: fire.years }) : undefined}
        wide
      >
        {!fire ? (
          <p className="text-sm text-tinta-2">{t("ui.risk.fireMissing")}</p>
        ) : (
          <>
            <Grid>
              <Stat label={t("ui.risk.fireTotal")} value={fire.total} />
              {fire.nearestKm !== null && <Stat label={t("ui.risk.fireNearest")} value={fmtNum(fire.nearestKm)} unit="km" />}
              {fire.lastAt && <Stat label={t("ui.risk.fireLast")} value={fmtDate(fire.lastAt)} />}
            </Grid>
            {fire.total === 0 ? (
              <p className="text-sm text-tinta-2">{t("ui.risk.fireNone")}</p>
            ) : (
              <div>
                <h3 className="eyebrow mb-2">{t("ui.risk.fireByMonth")}</h3>
                <ColumnChart
                  ariaLabel={t("ui.risk.fireByMonth")}
                  unit="focos"
                  color={CHART.warm}
                  items={fireByMonth(fire.byMonth)}
                />
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

/** Pantalla del informe de riesgo climático de la estancia, con descarga en PDF. */
export function RiskPage() {
  const { farmId } = useParams({ from: "/app/estancias/$farmId/riesgo" });
  const farm = useFarm(farmId);
  const me = useMe();
  const risk = useQuery({ queryKey: ["risk", farmId], queryFn: () => get<RiskResponse>(`/org/farms/${farmId}/risk`) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const body = useRef<HTMLDivElement>(null);
  if (farm.isLoading || risk.isLoading) return <Spinner />;
  if (farm.error || !farm.data) return <ErrorBox error={farm.error} />;
  if (risk.error || !risk.data) return <ErrorBox error={risk.error} />;
  const f = farm.data.farm;
  const { report, computedAt } = risk.data;
  const canPdf = !(me.data && isFieldRole(me.data.role)) && report !== null && computedAt !== null;

  const pdfFile = async () => {
    if (!report || computedAt === null) return;
    setBusy(true);
    setError(null);
    try {
      const [{ pdf }, { RiskReport }] = await Promise.all([import("@react-pdf/renderer"), import("../lib/riskPdf")]);
      const blob = await pdf(<RiskReport farm={f} risk={report} computedAt={computedAt} generatedAt={Date.now()} />).toBlob();
      download(blob, `${t("ui.risk.pdfFile")}-${f.name}.pdf`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      width="data"
      className="gap-6"
      back={{ to: `/estancias/${farmId}/informes`, label: t("ui.reports.back") }}
      title={t("ui.risk.title")}
      primary={
        canPdf ? (
          <Button variant="primary" onClick={pdfFile} disabled={busy}>
            {busy ? t("ui.risk.pdfWorking") : t("ui.risk.pdf")}
          </Button>
        ) : undefined
      }
      menu={report ? <PageExport root={body} name={t("ui.risk.title")} /> : undefined}
    >
      {report && computedAt !== null && <p className="-mt-3 text-sm text-tinta-2">{f.name} · {t("ui.risk.computed", { date: fmtDate(computedAt) })}</p>}
      {report === null ? (
        <EmptyState title={t("ui.risk.pending")}>{t("ui.risk.pendingHint")}</EmptyState>
      ) : (
        <div ref={body} className="flex flex-col gap-6">
          {error ? <ErrorBox error={error} /> : null}
          <RiskReportBody r={report} />
          <p className="text-xs text-tinta-2">{t("ui.risk.intro", { from: report.normalFrom, to: report.normalTo })}</p>
        </div>
      )}
    </Page>
  );
}
