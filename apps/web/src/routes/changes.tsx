/** Cambios en el terreno: área quemada tras un foco de fuego (S-20) y cambio de cobertura entre dos fechas (S-31). Indicativo. */
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { CoverSection } from "../components/CoverSection";
import { boundsOf, FarmMap } from "../components/FarmMap";
import { PageExport } from "../components/PageExport";
import { DataTable, EmptyState, ErrorBox, Field, Page, Select, Spinner, Stat, Tabs, type Column } from "../components/ui";
import { get } from "../lib/api";
import { analysisAreas, burnedEvents } from "@yvy/shared";
import { fmtDate, fmtHa } from "../lib/format";
import { t } from "../lib/i18n";
import { useFarm, useMe } from "../lib/queries";
import type { AnalysisPlot, BurnedMetrics } from "../lib/types";

function Disclaimer() {
  return (
    <section className="border-l-2 border-trigo pl-3">
      <h2 className="text-section leading-6 font-semibold">{t("ui.changesDisclaimerTitle")}</h2>
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
  const cols: Column<AnalysisPlot<BurnedMetrics>>[] = [
    { id: "plot", header: t("ui.eudrColPlot"), cell: (p) => p.plotName },
    { id: "area", header: t("ui.eudrColArea"), align: "right", cell: (p) => fmtHa(p.plotAreaHa), hideBelow: "sm" },
    { id: "burned", header: t("ui.burnedColBurned"), align: "right", cell: (p) => <span className="font-medium text-peligro">{fmtHa(p.metrics.burnedHa)}</span> },
    { id: "high", header: t("ui.burnedColHigh"), align: "right", cell: (p) => fmtHa(p.metrics.highHa) },
  ];

  return (
    <section className="flex flex-col gap-4">
      {!ev ? (
        <EmptyState compact>{t("ui.burnedNone")}</EmptyState>
      ) : (
        <>
          {events.length > 1 && (
            <div className="max-w-xs">
              <Field label={t("ui.burnedPick")}>
                <Select
                  value={ev.refKey}
                  onChange={(e) => setPicked(e.target.value)}
                  options={events.map((e) => ({ value: e.refKey, label: t("ui.burnedEvent", { date: fmtDate(e.eventAt) }) }))}
                />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-linea py-5 sm:grid-cols-3">
            <Stat label={t("ui.burnedTotal")} value={fmtHa(ev.burnedHa)} tone={ev.burnedHa > 0 ? "danger" : undefined} />
            {ev.highHa > 0 && <Stat label={t("ui.burnedHigh")} value={fmtHa(ev.highHa)} />}
            <Stat label={t("ui.burnedPlots")} value={String(ev.plots.length)} />
          </div>
          {ev.fromAt !== null && ev.toAt !== null && (
            <p className="text-sm text-tinta-2">{t("ui.burnedImages", { from: fmtDate(ev.fromAt), to: fmtDate(ev.toAt) })}</p>
          )}
          <div className="grid items-start gap-x-10 gap-y-5 lg:grid-cols-2">
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
            {ev.plots.length > 0 && <DataTable columns={cols} rows={ev.plots} rowKey={(p) => p.plotId} caption={t("ui.burnedTitle")} />}
          </div>
          <p className="text-sm text-tinta-2">
            {t("ui.burnedUnaffected", { n: ev.unaffected })}
            {ev.noData > 0 ? ` ${t("ui.burnedNoData", { n: ev.noData })}` : ""}
          </p>
          <p className="text-sm text-tinta-2">{t("ui.burnedMethod")}</p>
          <p className="text-micro text-tinta-2">
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
  const [tab, setTab] = useState<"burned" | "cover">("burned");
  const body = useRef<HTMLDivElement>(null);
  if (farm.isLoading) return <Spinner />;
  if (farm.error || !farm.data) return <ErrorBox error={farm.error} />;
  return (
    <Page
      width="data"
      className="gap-5"
      back={{ to: `/estancias/${farmId}/informes`, label: t("ui.reportsBack") }}
      title={t("ui.changesTitle")}
      menu={<PageExport root={body} name={t("ui.changesTitle")} />}
    >
      <p className="-mt-3 text-sm text-tinta-2">{farm.data.farm.name}</p>
      <Disclaimer />
      <Tabs
        tabs={[
          { id: "burned", label: t("ui.burnedTitle") },
          { id: "cover", label: t("ui.coverTitle") },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div ref={body}>{tab === "burned" ? <BurnedSection farmId={farmId} /> : <CoverSection farmId={farmId} />}</div>
    </Page>
  );
}
