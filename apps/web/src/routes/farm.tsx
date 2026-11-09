import { useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Polygon } from "geojson";
import { areaHa } from "@yvy/geo";
import { BRAND, POI_KINDS } from "@yvy/shared";
import { AlertsList } from "../components/AlertsList";
import { ClimatePanel } from "../components/ClimatePanel";
import { boundsOf, FarmMap } from "../components/FarmMap";
import { ImportPlots } from "../components/ImportPlots";
import { PlotPanel } from "../components/PlotPanel";
import { RecordsList } from "../components/RecordsList";
import { TasksPanel } from "../components/TasksPanel";
import { Button, ErrorBox, Field, Input, Modal, Select, Spinner, Tabs } from "../components/ui";
import { post } from "../lib/api";
import { download, plotsToKml } from "../lib/exports";
import { fmtHa } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useFarm, useMe, useMembers } from "../lib/queries";
import type { RecordRow } from "../lib/types";

type Tab = "plots" | "records" | "tasks" | "climate" | "alerts";

export function FarmPage() {
  const { farmId } = useParams({ from: "/app/estancias/$farmId" });
  const farm = useFarm(farmId);
  const me = useMe();
  const canEdit = !!me.data && me.data.role !== "worker";
  const members = useMembers(canEdit);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("plots");
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "draw" | "poi" | "import">("none");
  const [drawn, setDrawn] = useState<Polygon | null>(null);
  const [poiAt, setPoiAt] = useState<[number, number] | null>(null);
  const [showNdvi, setShowNdvi] = useState(false);
  const [records, setRecords] = useState<RecordRow[]>([]);

  const bounds = useMemo(() => (farm.data ? boundsOf(farm.data.farm) : null), [farm.data?.farm.id]);
  if (farm.isLoading) return <Spinner />;
  if (farm.error) return <ErrorBox error={farm.error} />;
  const d = farm.data!;
  const plot = d.plots.find((p) => p.id === selected);
  const workersOf = (plotId: string) =>
    (members.data ?? []).filter((m) => d.assignments.some((a) => a.plotId === plotId && a.userId === m.userId));
  const hasNdvi = d.layers.some((l) => l.layer === "ndvi");
  const hasBasemap = d.layers.some((l) => l.layer === "true_color");

  return (
    <div className="grid h-full lg:grid-cols-[minmax(0,1fr)_460px]">
      <div className="relative h-80 lg:h-full">
        <FarmMap
          outline={d.farm.geometry}
          plots={d.plots}
          pois={d.pois}
          layers={d.layers}
          tilesBaseUrl={me.data?.tilesBaseUrl}
          showNdvi={showNdvi}
          selectedPlotId={selected}
          bounds={bounds}
          points={
            tab === "records"
              ? records
                  .filter((r) => r.lat !== null)
                  .map((r) => ({ id: r.id, lon: r.lon!, lat: r.lat!, color: BRAND.trigo }))
              : []
          }
          drawing={mode === "draw"}
          onDrawn={(g) => {
            setDrawn(g);
            setMode("none");
          }}
          onPlotClick={(id) => {
            setSelected(id);
            setTab("plots");
          }}
          onMapClick={(lon, lat) => mode === "poi" && (setPoiAt([lon, lat]), setMode("none"))}
        />
        <div className="absolute left-3 top-3 flex flex-col gap-1 rounded-lg bg-white/90 p-2 text-xs shadow">
          <span className="font-semibold">{t("ui.layers")}</span>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked readOnly /> {t("ui.layerSatellite")}
          </label>
          <label className={`flex items-center gap-1.5 ${hasNdvi ? "" : "opacity-40"}`}>
            <input
              type="checkbox"
              disabled={!hasNdvi}
              checked={showNdvi}
              onChange={(e) => setShowNdvi(e.target.checked)}
            />{" "}
            {t("ui.layerNdvi")}
          </label>
          {!hasBasemap && <span className="max-w-40 text-surco/60">{t("ui.noBasemap")}</span>}
        </div>
        {mode === "poi" && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-surco px-3 py-2 text-sm text-lino">
            {t("ui.clickMapForPoi")}
          </div>
        )}
      </div>

      <section className="flex min-h-0 flex-col gap-3 overflow-auto p-4 *:shrink-0">
        <div>
          <h1 className="text-xl font-semibold">{d.farm.name}</h1>
          <p className="text-sm text-surco/70">
            {fmtHa(d.farm.areaHa)} · {d.plots.length} {t("ui.plots").toLowerCase()}
            {d.farm.department ? ` · ${d.farm.department}` : ""}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setMode(mode === "draw" ? "none" : "draw")}>
              ✎ {mode === "draw" ? t("ui.cancel") : t("ui.newPlot")}
            </Button>
            <Button variant="ghost" onClick={() => setMode("import")}>
              ⇪ {t("ui.importFile").split(" ")[0]}
            </Button>
            <Button variant="ghost" onClick={() => setMode(mode === "poi" ? "none" : "poi")}>
              ◎ {t("ui.addPoi")}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                download(
                  new Blob([plotsToKml(d.plots, d.farm.name)], { type: "application/vnd.google-earth.kml+xml" }),
                  `${d.farm.name}.kml`,
                )
              }
            >
              {t("ui.exportKml")}
            </Button>
            <Link to="/estancias/$farmId/parte" params={{ farmId }} search={{ desde: undefined, hasta: undefined }}>
              <Button variant="ghost">📄 {t("ui.tabReport")}</Button>
            </Link>
          </div>
        )}
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "plots", label: t("ui.tabPlots") },
            { id: "records", label: t("ui.tabRecords") },
            { id: "tasks", label: t("ui.tabTasks") },
            { id: "climate", label: t("ui.tabClimate") },
            { id: "alerts", label: t("ui.tabAlerts") },
          ]}
        />
        {tab === "plots" &&
          (plot ? (
            <PlotPanel
              key={plot.id}
              plot={plot}
              workers={workersOf(plot.id)}
              canEdit={canEdit}
              onClose={() => setSelected(null)}
            />
          ) : (
            <ul className="divide-y divide-surco/10 rounded-xl bg-white">
              {d.plots.map((p) => (
                <li key={p.id}>
                  <button
                    className="flex w-full items-center justify-between p-3 text-left text-sm hover:bg-lino/60"
                    onClick={() => setSelected(p.id)}
                  >
                    <span>
                      <span
                        className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: p.color ?? (p.kind === "pasture" ? BRAND.trigo : BRAND.soja) }}
                      />
                      {p.name}
                      <span className="ml-2 text-xs text-surco/60">
                        {p.crop ?? (p.kind === "pasture" ? t("ui.pasture") : "")}
                      </span>
                    </span>
                    <span className="text-surco/70">{fmtHa(p.areaHa)}</span>
                  </button>
                </li>
              ))}
              {d.pois.map((p) => (
                <li key={p.id} className="p-3 text-sm text-surco/70">
                  ◎ {p.name} · {tk(`ui.poiKinds_${p.kind}`)}
                </li>
              ))}
            </ul>
          ))}
        {tab === "records" && <RecordsList filters={{ farmId }} onRows={setRecords} />}
        {tab === "tasks" && <TasksPanel farmId={farmId} plots={d.plots} />}
        {tab === "climate" && <ClimatePanel farmId={farmId} />}
        {tab === "alerts" && <AlertsList farmId={farmId} />}
      </section>

      {mode === "import" && <ImportPlots farmId={farmId} onClose={() => setMode("none")} />}
      {drawn && (
        <NewPlotModal
          farmId={farmId}
          geometry={drawn}
          onClose={() => setDrawn(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["farm", farmId] })}
        />
      )}
      {poiAt && (
        <NewPoiModal
          farmId={farmId}
          at={poiAt}
          onClose={() => setPoiAt(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["farm", farmId] })}
        />
      )}
    </div>
  );
}

function NewPlotModal({
  farmId,
  geometry,
  onClose,
  onSaved,
}: {
  farmId: string;
  geometry: Polygon;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"crop" | "pasture">("crop");
  const save = useMutation({
    mutationFn: () => post(`/org/farms/${farmId}/plots`, { plots: [{ name, kind, geometry }] }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Modal title={t("ui.newPlot")} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className="text-sm">
          {t("ui.area")}: <strong>{fmtHa(areaHa(geometry))}</strong>
        </p>
        <Field label={t("ui.plot")}>
          <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("ui.plotKind")}>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as "crop")}
            options={[
              { value: "crop", label: t("ui.crop") },
              { value: "pasture", label: t("ui.pasture") },
            ]}
          />
        </Field>
        {save.error && <ErrorBox error={save.error} />}
        <Button type="submit" disabled={save.isPending}>
          {t("ui.save")}
        </Button>
      </form>
    </Modal>
  );
}

function NewPoiModal({
  farmId,
  at,
  onClose,
  onSaved,
}: {
  farmId: string;
  at: [number, number];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("rain_gauge");
  const save = useMutation({
    mutationFn: () => post(`/org/farms/${farmId}/pois`, { name, kind, lon: at[0], lat: at[1] }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Modal title={t("ui.addPoi")} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.kind")}>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            options={POI_KINDS.map((k) => ({ value: k, label: tk(`ui.poiKinds_${k}`) }))}
          />
        </Field>
        <Field label={t("ui.name")}>
          <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {save.error && <ErrorBox error={save.error} />}
        <Button type="submit" disabled={save.isPending}>
          {t("ui.save")}
        </Button>
      </form>
    </Modal>
  );
}
