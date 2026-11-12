/** Cambios en el terreno: área quemada tras un foco de fuego (S-20) y cambio de cobertura entre dos fechas (S-31). Indicativo. */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { CoverSection } from "../components/CoverSection";
import { boundsOf, FarmMap } from "../components/FarmMap";
import { Empty, ErrorBox, Spinner, Stat } from "../components/ui";
import { get } from "../lib/api";
import { analysisAreas, burnedEvents } from "../lib/changesData";
import { fmtDate, fmtHa } from "../lib/format";
import { t } from "../lib/i18n";
import { useFarm, useMe } from "../lib/queries";
import type { AnalysisPlot, BurnedMetrics } from "../lib/types";
import { ExportableTable } from "../components/ExportableTable";

function Disclaimer() {
  return (
    <section className="border-l-2 border-trigo pl-3">
      <h2 className="font-serif text-lg font-semibold">{t("ui.changesDisclaimerTitle")}</h2>
      <p className="mt-1 text-sm">{t("ui.changesDisclaimer")}</p>
    </section>
  );
}

function BurnedSection({ farmId }: { farmId: string }) {
  const farm = useFarm(farmId);
  const me = useMe();
  const burned = useQuery({
    queryKey: ["burned", farmId],
    queryFn: () => get<{ plots: AnalysisPlot<BurnedMetrics>[] }>(`/org/farms/${farmId}/burned`),
  });
  const events = useMemo(() => burnedEvents(burned.data?.plots ?? []), [burned.data]);
  const [picked, setPicked] = useState<string | null>(null);
  if (burned.isLoading || farm.isLoading) return <Spinner />;
  if (burned.error) return <ErrorBox error={burned.error} />;
  if (!farm.data) return null;
  const ev = events.find((e) => e.refKey === picked) ?? events[0];
  const f = farm.data.farm;
  const areas = analysisAreas(ev?.plots ?? []);

  return (
    <section className="flex flex-col gap-4 border-t border-linea pt-6">
      <h2 className="font-serif text-xl font-semibold">{t("ui.burnedTitle")}</h2>
      {!ev ? (
        <Empty>{t("ui.burnedNone")}</Empty>
      ) : (
        <>
          {events.length > 1 && (
            <label className="flex max-w-xs flex-col gap-1 text-sm">
              <span className="text-tinta-2">{t("ui.burnedPick")}</span>
              <select
                className="h-9 cursor-pointer rounded border border-linea bg-white px-2"
                value={ev.refKey}
                onChange={(e) => setPicked(e.target.value)}
              >
                {events.map((e) => (
                  <option key={e.refKey} value={e.refKey}>
                    {t("ui.burnedEvent", { date: fmtDate(e.eventAt) })}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label={t("ui.burnedTotal")} value={fmtHa(ev.burnedHa)} tone={ev.burnedHa > 0 ? "danger" : undefined} />
            <Stat label={t("ui.burnedHigh")} value={fmtHa(ev.highHa)} />
            <Stat label={t("ui.burnedPlots")} value={String(ev.plots.length)} />
          </div>
          {ev.fromAt !== null && ev.toAt !== null && (
            <p className="text-sm text-tinta-2">{t("ui.burnedImages", { from: fmtDate(ev.fromAt), to: fmtDate(ev.toAt) })}</p>
          )}
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
          {ev.plots.length > 0 && (
            <div className="overflow-x-auto">
              <ExportableTable name="cambios">
                <table className="num w-full text-sm">
                  <thead>
                    <tr className="border-b border-linea text-left text-tinta-2">
                      <th className="py-1.5 pr-3 font-normal">{t("ui.eudrColPlot")}</th>
                      <th className="px-3 py-1.5 text-right font-normal">{t("ui.eudrColArea")}</th>
                      <th className="px-3 py-1.5 text-right font-normal">{t("ui.burnedColBurned")}</th>
                      <th className="py-1.5 pl-3 text-right font-normal">{t("ui.burnedColHigh")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ev.plots.map((p) => (
                      <tr key={p.plotId} className="border-b border-linea/60">
                        <td className="py-1.5 pr-3">{p.plotName}</td>
                        <td className="px-3 py-1.5 text-right">{fmtHa(p.plotAreaHa)}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-peligro">{fmtHa(p.metrics.burnedHa)}</td>
                        <td className="py-1.5 pl-3 text-right">{fmtHa(p.metrics.highHa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ExportableTable>
            </div>
          )}
          <p className="text-sm text-tinta-2">
            {t("ui.burnedUnaffected", { n: ev.unaffected })}
            {ev.noData > 0 ? ` ${t("ui.burnedNoData", { n: ev.noData })}` : ""}
          </p>
          <p className="text-sm text-tinta-2">{t("ui.burnedMethod")}</p>
          <p className="text-[11px] text-tinta-2">
            {t("attribution.copernicus")} · {t("attribution.firms")}
          </p>
        </>
      )}
    </section>
  );
}

export function ChangesPage() {
  const { farmId } = useParams({ from: "/app/estancias/$farmId/cambios" });
  const farm = useFarm(farmId);
  if (farm.isLoading) return <Spinner />;
  if (farm.error || !farm.data) return <ErrorBox error={farm.error} />;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <div>
        <Link to="/estancias/$farmId" params={{ farmId }} className="text-sm text-tinta-2 underline underline-offset-2">
          {t("ui.gaugesBack")}
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold">
          {t("ui.changesTitle")} · {farm.data.farm.name}
        </h1>
      </div>
      <Disclaimer />
      <BurnedSection farmId={farmId} />
      <CoverSection farmId={farmId} />
    </div>
  );
}
