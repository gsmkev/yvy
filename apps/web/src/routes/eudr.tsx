/** Indicador de deforestación para la EUDR: por lote, con las dos fechas de los compuestos y un mapa de cambios. Indicativo. */
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { boundsOf, FarmMap } from "../components/FarmMap";
import { PageExport } from "../components/PageExport";
import { Button, DataTable, EmptyState, ErrorBox, SectionHead, Spinner, Stat, Page, type Column, StatRow } from "../components/ui";
import { get } from "../lib/api";
import { changeAreas, EUDR_METHOD, fmtRatio, statusText, summarize } from "../lib/eudrData";
import { download } from "../lib/exports";
import { fmtDate, fmtHa } from "../lib/format";
import { t } from "../lib/i18n";
import { useFarm, useMe } from "../lib/queries";
import type { EudrPlot, EudrResponse, FarmDetail } from "../lib/types";
import { ATTRIBUTION } from "@yvy/shared";

function Disclaimer() {
  return (
    <section className="border-l-2 border-trigo pl-3">
      <h2 className="text-section leading-6 font-semibold">{t("ui.eudr.disclaimerTitle")}</h2>
      <p className="mt-1 text-sm">{t("ui.eudr.disclaimer")}</p>
    </section>
  );
}

function Method({ refYear, curYear }: { refYear: number; curYear: number }) {
  const m = EUDR_METHOD;
  return (
    <section className="flex flex-col gap-2">
      <SectionHead title={t("ui.eudr.methodTitle")} />
      <div className="flex flex-col gap-2 text-sm text-tinta-2">
        <p>{t("ui.eudr.methodSource")}</p>
        <p>{t("ui.eudr.methodComposite", { ref: refYear, cur: curYear })}</p>
        <p>
          {t("ui.eudr.methodRule", {
            ndvi: fmtRatio(m.forestNdviMin),
            ndmi: fmtRatio(m.forestNdmiMin),
            ref: refYear,
            loss: fmtRatio(m.lossNdviMax),
            drop: fmtRatio(m.lossNdviDrop),
            min: fmtRatio(m.minPatchHa),
          })}
        </p>
        <p>{t("ui.eudr.methodLimits")}</p>
        <p>{t(ATTRIBUTION.copernicus)}.</p>
      </div>
    </section>
  );
}

const range = (from: number | null, to: number | null) => (from === null || to === null ? "—" : [fmtDate(from), fmtDate(to)]);

const eudrColumns = (refYear: number): Column<EudrPlot>[] => [
  { id: "plot", header: t("ui.eudr.colPlot"), cell: (p) => p.plotName },
  { id: "area", header: t("ui.eudr.colArea"), align: "right", cell: (p) => fmtHa(p.plotAreaHa), hideBelow: "sm" },
  { id: "forest", header: t("ui.eudr.colForest", { year: refYear }), align: "right", cell: (p) => (p.status === "no_data" ? "—" : fmtHa(p.forestRefHa)) },
  {
    id: "res",
    header: t("ui.eudr.colResult"),
    cell: (p) => <span className={p.status === "possible_loss" ? "font-medium text-peligro" : ""}>{statusText(p.status, p.lossHa)}</span>,
  },
];

/** Genera y descarga el PDF del indicador; guarda si está trabajando y el error si falla. */
function useEudrPdf(farm: FarmDetail, data: EudrResponse) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pdfFile = async () => {
    setBusy(true);
    setError(null);
    try {
      const [{ pdf }, { EudrReport }] = await Promise.all([import("@react-pdf/renderer"), import("../lib/eudrPdf")]);
      const blob = await pdf(<EudrReport farm={farm.farm} data={data} plots={farm.plots} generatedAt={Date.now()} />).toBlob();
      download(blob, `${t("ui.eudr.pdfFile")}-${farm.farm.name}.pdf`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, pdfFile };
}

/** Fechas de los dos compuestos satelitales que se comparan. */
function Composites({ sum, refYear, curYear }: { sum: ReturnType<typeof summarize>; refYear: number; curYear: number }) {
  const r = range(sum.refFromAt, sum.refToAt);
  const c = range(sum.curFromAt, sum.curToAt);
  return (
    <div className="flex flex-col gap-1 text-sm text-tinta-2">
      <p>{t("ui.eudr.refComposite", { year: refYear, from: r[0]!, to: r[1]!, n: sum.refScenes })}</p>
      <p>{t("ui.eudr.curComposite", { year: curYear, from: c[0]!, to: c[1]!, n: sum.curScenes })}</p>
    </div>
  );
}

/** Props del cuerpo del indicador: la estancia, el cálculo y lo derivado de él. */
interface EudrBodyProps {
  farm: FarmDetail;
  data: EudrResponse;
  sum: ReturnType<typeof summarize>;
  areas: ReturnType<typeof changeAreas>;
  refYear: number;
  curYear: number;
  error: unknown;
  tilesBaseUrl: string | undefined;
  bodyRef: React.RefObject<HTMLDivElement | null>;
}

function EudrBody({ farm, data, sum, areas, refYear, curYear, error, tilesBaseUrl, bodyRef }: EudrBodyProps) {
  const f = farm.farm;
  return (
    <div ref={bodyRef} className="flex flex-col gap-6">
      <StatRow className="border-y border-linea py-5">
        <Stat label={t("ui.eudr.forest", { year: refYear })} value={fmtHa(sum.forestRefHa)} />
        {sum.lossHa > 0 && <Stat label={t("ui.eudr.loss")} value={fmtHa(sum.lossHa)} tone="danger" />}
        <Stat label={t("ui.eudr.plotsWithLoss")} value={`${sum.withLoss} / ${sum.plots}`} />
      </StatRow>
      <Composites sum={sum} refYear={refYear} curYear={curYear} />
      {error ? <ErrorBox error={error} /> : null}
      <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <SectionHead title={t("ui.eudr.mapTitle")} />
          <div className="h-80 overflow-hidden rounded-lg border border-linea">
            <FarmMap
              outline={f.geometry}
              plots={farm.plots}
              problemAreas={areas}
              layers={farm.layers}
              tilesBaseUrl={tilesBaseUrl}
              bounds={boundsOf(f)}
              className="h-full w-full"
            />
          </div>
          {areas.length === 0 && <p className="text-sm text-tinta-2">{t("ui.eudr.mapNone")}</p>}
        </section>
        <section className="flex min-w-0 flex-col gap-3">
          <SectionHead title={t("ui.eudr.plotsTitle")} />
          <DataTable columns={eudrColumns(refYear)} rows={data.plots} rowKey={(p) => p.plotId} caption={t("ui.eudr.plotsTitle")} />
        </section>
      </div>
      <Method refYear={refYear} curYear={curYear} />
    </div>
  );
}

/** Pantalla del indicador EUDR de la estancia. */
export function EudrPage() {
  const { farmId } = useParams({ from: "/app/estancias/$farmId/eudr" });
  const farm = useFarm(farmId);
  const me = useMe();
  const eudr = useQuery({ queryKey: ["eudr", farmId], queryFn: () => get<EudrResponse>(`/org/farms/${farmId}/eudr`) });
  const body = useRef<HTMLDivElement>(null);
  const data = eudr.data;
  const sum = useMemo(() => (data ? summarize(data) : null), [data]);
  const areas = useMemo(() => (data ? changeAreas(data.plots) : []), [data]);
  if (farm.isLoading || eudr.isLoading) return <Spinner />;
  if (farm.error || !farm.data) return <ErrorBox error={farm.error} />;
  if (eudr.error || !data || !sum) return <ErrorBox error={eudr.error} />;
  return <EudrScreen farm={farm.data} data={data} sum={sum} areas={areas} tilesBaseUrl={me.data?.tilesBaseUrl} bodyRef={body} />;
}

function EudrScreen({
  farm,
  data,
  sum,
  areas,
  tilesBaseUrl,
  bodyRef,
}: Pick<EudrBodyProps, "farm" | "data" | "sum" | "areas" | "tilesBaseUrl" | "bodyRef">) {
  const f = farm.farm;
  const pdf = useEudrPdf(farm, data);
  const hasData = data.plots.length > 0 && data.computedAt !== null;
  return (
    <Page
      width="data"
      className="gap-6"
      back={{ to: `/estancias/${f.id}/informes`, label: t("ui.reports.back") }}
      title={t("ui.eudr.title")}
      primary={
        hasData ? (
          <Button variant="primary" onClick={pdf.pdfFile} disabled={pdf.busy}>
            {pdf.busy ? t("ui.eudr.pdfWorking") : t("ui.eudr.pdf")}
          </Button>
        ) : undefined
      }
      menu={hasData ? <PageExport root={bodyRef} name={t("ui.eudr.title")} /> : undefined}
    >
      {hasData && (
        <p className="-mt-3 text-sm text-tinta-2">
          <span className="block font-medium text-surco">{f.name}</span>
          {t("ui.eudr.computed", { date: fmtDate(data.computedAt!) })}
        </p>
      )}
      <Disclaimer />
      {!hasData ? (
        <EmptyState title={data.plots.length === 0 && farm.plots.length === 0 ? t("ui.eudr.noPlots") : t("ui.eudr.pending")} />
      ) : (
        <EudrBody
          farm={farm}
          data={data}
          sum={sum}
          areas={areas}
          refYear={sum.refYear ?? 2020}
          curYear={sum.curYear ?? new Date().getFullYear()}
          error={pdf.error}
          tilesBaseUrl={tilesBaseUrl}
          bodyRef={bodyRef}
        />
      )}
    </Page>
  );
}
