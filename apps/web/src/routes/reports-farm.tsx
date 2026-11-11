/** Informes de una estancia: resumen de campaña por lote (R-03). */
import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { localDate } from "@yvy/shared";
import { Button, ErrorBox, Field, Select, Spinner } from "../components/ui";
import { download } from "../lib/exports";
import { t } from "../lib/i18n";
import { fetchAllRecords, useFarm } from "../lib/queries";
import {
  fetchClimate,
  fetchNdvi,
  gaugeBetween,
  normalBetween,
  rainBetween,
  seasonStart,
} from "../lib/reportsData";

export function FarmReportsPage() {
  const { farmId } = useParams({ from: "/app/estancias/$farmId/informes" });
  const farm = useFarm(farmId);
  const [plotId, setPlotId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-4">
      <h1 className="text-xl font-semibold">
        {t("ui.reportsTitle")} · {f.name}
      </h1>
      <section>
        <h2 className="font-serif text-xl font-semibold">{t("ui.seasonReportTitle")}</h2>
        <p className="mt-1 text-sm text-tinta-2">{t("ui.reportsSeasonIntro")}</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label={t("ui.reportsPickPlot")}>
            <Select
              value={plot?.id ?? ""}
              onChange={(e) => setPlotId(e.target.value)}
              options={plots.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Button variant="primary" onClick={seasonPdf} disabled={busy || !plot}>
            {busy ? t("ui.reportsGenerating") : t("ui.reportsSeasonPdf")}
          </Button>
        </div>
      </section>
      {error ? <ErrorBox error={error} /> : null}
    </div>
  );
}
