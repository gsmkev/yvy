/** Indicador de deforestación para la EUDR (S-30): por lote, con las dos fechas de los compuestos y un mapa de cambios. Indicativo. */
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { boundsOf, FarmMap } from "../components/FarmMap";
import { PageExport } from "../components/PageExport";
import { Button, DataTable, EmptyState, ErrorBox, SectionHead, Spinner, Stat, Page, type Column } from "../components/ui";
import { get } from "../lib/api";
import { changeAreas, EUDR_METHOD, fmtRatio, statusText, summarize } from "../lib/eudrData";
import { download } from "../lib/exports";
import { fmtDate, fmtHa } from "../lib/format";
import { t } from "../lib/i18n";
import { useFarm, useMe } from "../lib/queries";
import type { EudrPlot, EudrResponse } from "../lib/types";

function Disclaimer() {
  return (
    <section className="border-l-2 border-trigo pl-3">
      <h2 className="text-section leading-6 font-semibold">{t("ui.eudrDisclaimerTitle")}</h2>
      <p className="mt-1 text-sm">{t("ui.eudrDisclaimer")}</p>
    </section>
  );
}

function Method({ refYear, curYear }: { refYear: number; curYear: number }) {
  const m = EUDR_METHOD;
  return (
    <section className="flex flex-col gap-2">
      <SectionHead title={t("ui.eudrMethodTitle")} />
      <div className="flex flex-col gap-2 text-sm text-tinta-2">
        <p>{t("ui.eudrMethodSource")}</p>
        <p>{t("ui.eudrMethodComposite", { ref: refYear, cur: curYear })}</p>
        <p>
          {t("ui.eudrMethodRule", {
            ndvi: fmtRatio(m.forestNdviMin),
            ndmi: fmtRatio(m.forestNdmiMin),
            ref: refYear,
            loss: fmtRatio(m.lossNdviMax),
            drop: fmtRatio(m.lossNdviDrop),
            min: fmtRatio(m.minPatchHa),
          })}
        </p>
        <p>{t("ui.eudrMethodLimits")}</p>
        <p>{t("attribution.copernicus")}.</p>
      </div>
    </section>
  );
}

export function EudrPage() {
  const { farmId } = useParams({ from: "/app/estancias/$farmId/eudr" });
  const farm = useFarm(farmId);
  const me = useMe();
  const eudr = useQuery({ queryKey: ["eudr", farmId], queryFn: () => get<EudrResponse>(`/org/farms/${farmId}/eudr`) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const body = useRef<HTMLDivElement>(null);
  const data = eudr.data;
  const sum = useMemo(() => (data ? summarize(data) : null), [data]);
  const areas = useMemo(() => (data ? changeAreas(data.plots) : []), [data]);
  if (farm.isLoading || eudr.isLoading) return <Spinner />;
  if (farm.error || !farm.data) return <ErrorBox error={farm.error} />;
  if (eudr.error || !data || !sum) return <ErrorBox error={eudr.error} />;
  const f = farm.data.farm;
  const hasData = data.plots.length > 0 && data.computedAt !== null;
  const refYear = sum.refYear ?? 2020;
  const curYear = sum.curYear ?? new Date().getFullYear();

  const pdfFile = async () => {
    setBusy(true);
    setError(null);
    try {
      const [{ pdf }, { EudrReport }] = await Promise.all([import("@react-pdf/renderer"), import("../lib/eudrPdf")]);
      const blob = await pdf(<EudrReport farm={f} data={data} plots={farm.data.plots} generatedAt={Date.now()} />).toBlob();
      download(blob, `${t("ui.eudrPdfFile")}-${f.name}.pdf`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const range = (from: number | null, to: number | null) => (from === null || to === null ? "—" : [fmtDate(from), fmtDate(to)]);

  const cols: Column<EudrPlot>[] = [
    { id: "plot", header: t("ui.eudrColPlot"), cell: (p) => p.plotName },
    { id: "area", header: t("ui.eudrColArea"), align: "right", cell: (p) => fmtHa(p.plotAreaHa), hideBelow: "sm" },
    { id: "forest", header: t("ui.eudrColForest", { year: refYear }), align: "right", cell: (p) => (p.status === "no_data" ? "—" : fmtHa(p.forestRefHa)) },
    {
      id: "res",
      header: t("ui.eudrColResult"),
      cell: (p) => <span className={p.status === "possible_loss" ? "font-medium text-peligro" : ""}>{statusText(p.status, p.lossHa)}</span>,
    },
  ];
  return (
    <Page
      width="data"
      className="gap-6"
      back={{ to: `/estancias/${farmId}/informes`, label: t("ui.reportsBack") }}
      title={t("ui.eudrTitle")}
      primary={
        hasData ? (
          <Button variant="primary" onClick={pdfFile} disabled={busy}>
            {busy ? t("ui.eudrPdfWorking") : t("ui.eudrPdf")}
          </Button>
        ) : undefined
      }
      menu={hasData ? <PageExport root={body} name={t("ui.eudrTitle")} /> : undefined}
    >
      {hasData && <p className="-mt-3 text-sm text-tinta-2">{f.name} · {t("ui.eudrComputed", { date: fmtDate(data.computedAt!) })}</p>}
      <Disclaimer />
      {!hasData ? (
        <EmptyState title={data.plots.length === 0 && farm.data.plots.length === 0 ? t("ui.eudrNoPlots") : t("ui.eudrPending")} />
      ) : (
        <div ref={body} className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-linea py-5 sm:grid-cols-3">
            <Stat label={t("ui.eudrForest", { year: refYear })} value={fmtHa(sum.forestRefHa)} />
            {sum.lossHa > 0 && <Stat label={t("ui.eudrLoss")} value={fmtHa(sum.lossHa)} tone="danger" />}
            <Stat label={t("ui.eudrPlotsWithLoss")} value={`${sum.withLoss} / ${sum.plots}`} />
          </div>
          <div className="flex flex-col gap-1 text-sm text-tinta-2">
            {(() => {
              const r = range(sum.refFromAt, sum.refToAt);
              const c = range(sum.curFromAt, sum.curToAt);
              return (
                <>
                  <p>{t("ui.eudrRefComposite", { year: refYear, from: r[0]!, to: r[1]!, n: sum.refScenes })}</p>
                  <p>{t("ui.eudrCurComposite", { year: curYear, from: c[0]!, to: c[1]!, n: sum.curScenes })}</p>
                </>
              );
            })()}
          </div>
          {error ? <ErrorBox error={error} /> : null}

          <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-2">
            <section className="flex flex-col gap-3">
              <SectionHead title={t("ui.eudrMapTitle")} />
              <div className="h-80 overflow-hidden rounded-lg border border-linea">
                <FarmMap
                  outline={f.geometry}
                  plots={farm.data.plots}
                  problemAreas={areas}
                  layers={farm.data.layers}
                  tilesBaseUrl={me.data?.tilesBaseUrl}
                  bounds={boundsOf(f)}
                  className="h-full w-full"
                />
              </div>
              {areas.length === 0 && <p className="text-sm text-tinta-2">{t("ui.eudrMapNone")}</p>}
            </section>
            <section className="flex min-w-0 flex-col gap-3">
              <SectionHead title={t("ui.eudrPlotsTitle")} />
              <DataTable columns={cols} rows={data.plots} rowKey={(p) => p.plotId} caption={t("ui.eudrPlotsTitle")} />
            </section>
          </div>
          <Method refYear={refYear} curYear={curYear} />
        </div>
      )}
    </Page>
  );
}
