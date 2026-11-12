/** Informe de riesgo climático de la estancia (C-10): heladas, lluvia frente a lo normal, sequías y focos de calor. */
import { useState } from "react";
import { isFieldRole } from "@yvy/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { CHART, type FarmRisk } from "@yvy/shared";
import { ColumnChart, MonthlyRainChart } from "../components/charts";
import { Button, Empty, ErrorBox, Spinner, Stat } from "../components/ui";
import { get } from "../lib/api";
import { download } from "../lib/exports";
import { fmtDate, fmtMm, fmtNum } from "../lib/format";
import { t } from "../lib/i18n";
import { useFarm, useMe } from "../lib/queries";
import { fireByMonth, fmtMmDd, rainByMonth, type RiskResponse } from "../lib/riskData";
import { ExportableTable } from "../components/ExportableTable";

function Section({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-linea pt-6">
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      {lead && <p className="mt-1 text-sm text-tinta-2">{lead}</p>}
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </section>
  );
}

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{children}</div>
);

export function RiskReportBody({ r }: { r: FarmRisk }) {
  const rain = rainByMonth(r.rain);
  const fire = r.fire;
  return (
    <>
      <Section title={t("ui.riskFrostTitle")} lead={t("ui.riskFrostLead", { c: r.frost.thresholdC })}>
        <Grid>
          <Stat label={t("ui.riskFrostMean")} value={fmtNum(r.frost.meanPerYear)} unit="días" />
          <Stat
            label={t("ui.riskFrostWorst")}
            value={r.frost.worst ? r.frost.worst.days : "—"}
            unit={r.frost.worst ? "días" : undefined}
            note={r.frost.worst ? String(r.frost.worst.year) : undefined}
          />
          <Stat label={t("ui.riskFrostYears")} value={r.frost.yearsWithFrostPct} unit="%" />
          <Stat
            label={t("ui.riskFrostFirst")}
            value={fmtMmDd(r.frost.typicalFirstFrost)}
            note={`${t("ui.riskFrostLast")}: ${fmtMmDd(r.frost.typicalLastFrost)}`}
          />
        </Grid>
        <div>
          <h3 className="eyebrow mb-2">{t("ui.riskFrostChart")}</h3>
          <ColumnChart
            ariaLabel={t("ui.riskFrostChart")}
            unit="días"
            every={3}
            color={CHART.comparison}
            items={r.frost.perYear.map((p) => ({ label: String(p.year), value: p.days }))}
          />
        </div>
      </Section>

      <Section title={t("ui.riskRainTitle")}>
        <Stat label={t("ui.riskRainAnnual")} value={fmtNum(r.rain.annualMeanMm)} unit="mm" />
        {rain.length > 0 ? (
          <>
            <MonthlyRainChart
              ariaLabel={t("ui.riskRainTitle")}
              labels={{ gauge: t("ui.riskRainRecent"), satellite: "", normal: t("ui.riskRainNormal") }}
              months={rain.map((m) => ({ label: m.label, gauge: m.mm, sat: null, normal: m.normalMm }))}
            />
            <div className="overflow-x-auto">
              <ExportableTable name="riesgo">
                <table className="num w-full text-sm">
                  <thead>
                    <tr className="border-b border-linea text-left text-tinta-2">
                      <th className="py-1.5 pr-3 font-normal">{t("ui.gaugesMonth")}</th>
                      <th className="px-3 py-1.5 text-right font-normal">{t("ui.riskRainRecent")}</th>
                      <th className="px-3 py-1.5 text-right font-normal">{t("ui.riskRainNormal")}</th>
                      <th className="py-1.5 pl-3 text-right font-normal">{t("ui.riskRainRange")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rain.map((m) => (
                      <tr key={m.key} className="border-b border-linea/60">
                        <td className="py-1.5 pr-3">{m.label}</td>
                        <td className="px-3 py-1.5 text-right">{fmtMm(m.mm)}</td>
                        <td className="px-3 py-1.5 text-right">
                          {m.normalMm === null ? "—" : fmtMm(m.normalMm)}
                        </td>
                        <td className="py-1.5 pl-3 text-right">
                          {m.p20Mm === null || m.p80Mm === null ? "—" : `${Math.round(m.p20Mm)} a ${Math.round(m.p80Mm)} mm`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ExportableTable>
            </div>
          </>
        ) : null}
      </Section>

      <Section title={t("ui.riskDryTitle")} lead={t("ui.riskDryLead", { mm: r.dry.thresholdMm })}>
        <Grid>
          <Stat label={t("ui.riskDryMean")} value={fmtNum(r.dry.meanLongestDays)} unit="días" />
          <Stat
            label={t("ui.riskDryWorst")}
            value={r.dry.worst ? r.dry.worst.days : "—"}
            unit={r.dry.worst ? "días" : undefined}
            note={r.dry.worst ? String(r.dry.worst.year) : undefined}
          />
          <Stat label={t("ui.riskDrySummer")} value={fmtNum(r.dry.summerMeanLongestDays)} unit="días" />
          <Stat label={t("ui.riskDrySpells")} value={fmtNum(r.dry.spells15PerYear)} />
        </Grid>
      </Section>

      <Section
        title={t("ui.riskFireTitle")}
        lead={fire ? t("ui.riskFireLead", { km: fire.radiusKm, years: fire.years }) : undefined}
      >
        {!fire ? (
          <p className="text-sm text-tinta-2">{t("ui.riskFireMissing")}</p>
        ) : (
          <>
            <Grid>
              <Stat label={t("ui.riskFireTotal")} value={fire.total} />
              <Stat
                label={t("ui.riskFireNearest")}
                value={fire.nearestKm === null ? "—" : fmtNum(fire.nearestKm)}
                unit={fire.nearestKm === null ? undefined : "km"}
              />
              <Stat label={t("ui.riskFireLast")} value={fire.lastAt ? fmtDate(fire.lastAt) : "—"} />
            </Grid>
            {fire.total === 0 ? (
              <p className="text-sm text-tinta-2">{t("ui.riskFireNone")}</p>
            ) : (
              <div>
                <h3 className="eyebrow mb-2">{t("ui.riskFireByMonth")}</h3>
                <ColumnChart
                  ariaLabel={t("ui.riskFireByMonth")}
                  unit="focos"
                  color={CHART.warm}
                  items={fireByMonth(fire.byMonth)}
                />
              </div>
            )}
          </>
        )}
      </Section>
    </>
  );
}

export function RiskPage() {
  const { farmId } = useParams({ from: "/app/estancias/$farmId/riesgo" });
  const farm = useFarm(farmId);
  const me = useMe();
  const risk = useQuery({ queryKey: ["risk", farmId], queryFn: () => get<RiskResponse>(`/org/farms/${farmId}/risk`) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
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
      download(blob, `${t("ui.riskPdfFile")}-${f.name}.pdf`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <div>
        <Link to="/estancias/$farmId" params={{ farmId }} className="text-sm text-tinta-2 underline underline-offset-2">
          {t("ui.gaugesBack")}
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold">
          {t("ui.riskTitle")} · {f.name}
        </h1>
        {report && computedAt !== null && (
          <>
            <p className="mt-1 text-sm text-tinta-2">{t("ui.riskIntro", { from: report.normalFrom, to: report.normalTo })}</p>
            <p className="mt-1 text-sm text-tinta-2">{t("ui.riskComputed", { date: fmtDate(computedAt) })}</p>
          </>
        )}
      </div>
      {report === null ? (
        <Empty>{t("ui.riskPending")}</Empty>
      ) : (
        <>
          {canPdf && (
            <div>
              <Button variant="primary" onClick={pdfFile} disabled={busy}>
                {busy ? t("ui.riskPdfWorking") : t("ui.riskPdf")}
              </Button>
            </div>
          )}
          {error ? <ErrorBox error={error} /> : null}
          <RiskReportBody r={report} />
        </>
      )}
    </div>
  );
}
