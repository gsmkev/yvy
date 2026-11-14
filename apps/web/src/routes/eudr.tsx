/** Indicador de deforestación para la EUDR (S-30): por lote, con las dos fechas de los compuestos y un mapa de cambios. Indicativo. */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { boundsOf, FarmMap } from "../components/FarmMap";
import { FarmPageHeader } from "../components/FarmPageHeader";
import { Button, EmptyState, ErrorBox, Spinner, Stat } from "../components/ui";
import { get } from "../lib/api";
import { changeAreas, EUDR_METHOD, fmtRatio, statusText, summarize } from "../lib/eudrData";
import { download } from "../lib/exports";
import { fmtDate, fmtHa } from "../lib/format";
import { t } from "../lib/i18n";
import { useFarm, useMe } from "../lib/queries";
import type { EudrResponse } from "../lib/types";
import { ExportableTable } from "../components/ExportableTable";

function Disclaimer() {
  return (
    <section className="border-l-2 border-trigo pl-3">
      <h2 className="text-[18px] leading-6 font-semibold">{t("ui.eudrDisclaimerTitle")}</h2>
      <p className="mt-1 text-sm">{t("ui.eudrDisclaimer")}</p>
    </section>
  );
}

function Method({ refYear, curYear }: { refYear: number; curYear: number }) {
  const m = EUDR_METHOD;
  return (
    <section className="border-t border-linea pt-6">
      <h2 className="text-[18px] leading-6 font-semibold">{t("ui.eudrMethodTitle")}</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm text-tinta-2">
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 lg:p-6">
      <div>
        <FarmPageHeader
          farmId={farmId}
          farmName={f.name}
          title={t("ui.eudrTitle")}
          primary={
            hasData ? (
              <Button variant="primary" onClick={pdfFile} disabled={busy}>
                {busy ? t("ui.eudrPdfWorking") : t("ui.eudrPdf")}
              </Button>
            ) : undefined
          }
        />
        {hasData && <p className="text-sm text-tinta-2">{t("ui.eudrComputed", { date: fmtDate(data.computedAt!) })}</p>}
      </div>
      <Disclaimer />
      {!hasData ? (
        <EmptyState title={data.plots.length === 0 && farm.data.plots.length === 0 ? t("ui.eudrNoPlots") : t("ui.eudrPending")} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label={t("ui.eudrForest", { year: refYear })} value={fmtHa(sum.forestRefHa)} />
            <Stat label={t("ui.eudrLoss")} value={fmtHa(sum.lossHa)} tone={sum.lossHa > 0 ? "danger" : undefined} />
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

          <section className="border-t border-linea pt-6">
            <h2 className="text-[18px] leading-6 font-semibold">{t("ui.eudrMapTitle")}</h2>
            <div className="mt-3 h-80 overflow-hidden rounded-lg border border-linea">
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
            {areas.length === 0 && <p className="mt-2 text-sm text-tinta-2">{t("ui.eudrMapNone")}</p>}
          </section>

          <section className="border-t border-linea pt-6">
            <h2 className="text-[18px] leading-6 font-semibold">{t("ui.eudrPlotsTitle")}</h2>
            <div className="mt-3 overflow-x-auto">
              <ExportableTable name="eudr">
                <table className="num w-full text-sm">
                  <thead>
                    <tr className="border-b border-linea text-left text-tinta-2">
                      <th className="py-1.5 pr-3 font-normal">{t("ui.eudrColPlot")}</th>
                      <th className="px-3 py-1.5 text-right font-normal">{t("ui.eudrColArea")}</th>
                      <th className="px-3 py-1.5 text-right font-normal">{t("ui.eudrColForest", { year: refYear })}</th>
                      <th className="py-1.5 pl-3 font-normal">{t("ui.eudrColResult")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.plots.map((p) => (
                      <tr key={p.plotId} className="border-b border-linea/60">
                        <td className="py-1.5 pr-3">{p.plotName}</td>
                        <td className="px-3 py-1.5 text-right">{fmtHa(p.plotAreaHa)}</td>
                        <td className="px-3 py-1.5 text-right">{p.status === "no_data" ? "—" : fmtHa(p.forestRefHa)}</td>
                        <td className={`py-1.5 pl-3 ${p.status === "possible_loss" ? "font-medium text-peligro" : ""}`}>
                          {statusText(p.status, p.lossHa)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ExportableTable>
            </div>
          </section>
          <Method refYear={refYear} curYear={curYear} />
        </>
      )}
    </div>
  );
}
