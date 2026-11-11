import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Polygon } from "geojson";
import { MapPinPlus, PenLine, Upload, X } from "lucide-react";
import { areaHa, bboxOf, type Area } from "@yvy/geo";
import { BRAND, NDVI_RAMP, POI_KINDS } from "@yvy/shared";
import { AlertsList } from "../components/AlertsList";
import { CopyCoords } from "../components/CopyCoords";
import { ClimatePanel } from "../components/ClimatePanel";
import { boundsOf, FarmMap } from "../components/FarmMap";
import { ExportButtons } from "../components/ExportButtons";
import { ImportPlots } from "../components/ImportPlots";
import { PlotPanel } from "../components/PlotPanel";
import { HerdPanel } from "../components/HerdPanel";
import { PlotsTable } from "../components/PlotsTable";
import { CompareOverlay, SceneControls } from "../components/SceneControls";
import { RecordsList } from "../components/RecordsList";
import { SeasonsPanel } from "../components/SeasonsPanel";
import { TasksPanel } from "../components/TasksPanel";
import { Button, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, Tabs, toast } from "../components/ui";
import { del, post } from "../lib/api";
import { deleteWithUndo } from "../lib/undo";
import { download, plotsToGeoJson, plotsToKml, plotsToShapefileZip } from "../lib/exports";
import { closedAreaHa, fmtDistance, pathLengthM, type LonLat } from "../lib/measure";
import { fmtDate, fmtHa, fmtNum } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { loadPrefs, savePrefs } from "../lib/prefs";
import { useAlerts, useFarm, useFarms, useMe, useMembers, useProblemAreas } from "../lib/queries";
import { defaultCompare, layerDates, pickLayer, type Camera } from "../lib/scenes";
import type { FarmDetail, RecordRow } from "../lib/types";

/** Días sin anotaciones para considerar un lote sin visitar. */
const UNVISITED_DAYS = 7;

type Tab = "plots" | "seasons" | "records" | "tasks" | "climate" | "alerts" | "herd";
const TABS: Tab[] = ["plots", "seasons", "records", "tasks", "climate", "alerts", "herd"];

export function FarmPage() {
  const { farmId } = useParams({ from: "/app/estancias/$farmId" });
  const farm = useFarm(farmId);
  const farms = useFarms();
  const me = useMe();
  const canEdit = !!me.data && me.data.role !== "worker";
  const members = useMembers(canEdit);
  const alerts = useAlerts({ farmId, active: true });
  const problems = useProblemAreas(farmId, canEdit);
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; zoom?: number; n: number } | null>(null);
  const qc = useQueryClient();
  const [tabPref, setTab] = useState<Tab>(() => {
    const saved = loadPrefs().tab;
    return TABS.includes(saved as Tab) ? (saved as Tab) : "plots";
  });
  // Una pestaña guardada que este rol no tiene (ej. "herd" para un empleado) cae en Lotes en vez de mostrar nada.
  const tab: Tab = tabPref === "herd" && !canEdit ? "plots" : tabPref;
  const [onlyUnvisited, setOnlyUnvisited] = useState(false);
  const { lote } = useSearch({ from: "/app/estancias/$farmId" });
  const [selected, setSelected] = useState<string | null>(lote ?? null);
  // Llegar desde el buscador con ?lote= elige ese lote
  useEffect(() => {
    if (lote) {
      setSelected(lote);
      setTab("plots");
    }
  }, [lote]);
  const [mode, setMode] = useState<"none" | "draw" | "poi" | "import">("none");
  const [drawn, setDrawn] = useState<Polygon | null>(null);
  const [poiAt, setPoiAt] = useState<[number, number] | null>(null);
  const [wantedLayer, setLayer] = useState<"satellite" | "ndvi">(() =>
    loadPrefs().layer === "ndvi" ? "ndvi" : "satellite",
  );
  useEffect(() => savePrefs({ farmId }), [farmId]);
  // S-04: fecha elegida por tipo de capa y comparación con cortina
  const [pickedIds, setPickedIds] = useState<{ ndvi?: string; true_color?: string }>({});
  const [compare, setCompare] = useState<{ left: string; right: string } | null>(null);
  const [curtain, setCurtain] = useState(50);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  // Bajo lg no entran el mapa y el panel juntos: se alterna entre uno y otro.
  const [view, setView] = useState<"map" | "list">("map");
  useEffect(() => {
    if (mode === "draw" || mode === "poi") setView("map");
  }, [mode]);
  // Medir: puntos marcados, forma cerrada; Esc termina.
  const [measuring, setMeasuring] = useState(false);
  const [mPoints, setMPoints] = useState<LonLat[]>([]);
  const [mClosed, setMClosed] = useState(false);
  const endMeasure = () => {
    setMeasuring(false);
    setMPoints([]);
    setMClosed(false);
  };
  useEffect(() => {
    if (!measuring) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && endMeasure();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [measuring]);
  useEffect(() => {
    if (mode !== "none" && measuring) endMeasure();
  }, [mode]);

  // Con un lote elegido el mapa encuadra el lote; sin selección, la estancia entera.
  const selectedGeometry = farm.data?.plots.find((p) => p.id === selected)?.geometry;
  const bounds = useMemo(() => {
    if (!farm.data) return null;
    if (selectedGeometry) {
      const b = bboxOf(JSON.parse(selectedGeometry) as Area);
      return [b.minLon, b.minLat, b.maxLon, b.maxLat] as [number, number, number, number];
    }
    return boundsOf(farm.data.farm);
  }, [farm.data?.farm.id, selectedGeometry]);
  if (farm.isLoading)
    return (
      <div className="p-6">
        <Spinner />
      </div>
    );
  if (farm.error)
    return (
      <div className="p-6">
        <ErrorBox error={farm.error} />
      </div>
    );
  const d = farm.data!;
  const staleBefore = Date.now() - UNVISITED_DAYS * 86_400_000;
  const unvisited = d.plots.filter((p) => !p.lastRecordAt || p.lastRecordAt < staleBefore);
  const shownPlots = onlyUnvisited ? unvisited : d.plots;
  const removePoi = (id: string) =>
    deleteWithUndo({
      qc,
      id,
      message: t("ui.toastPoiDeleted"),
      hide: () =>
        qc.setQueryData<FarmDetail>(["farm", farmId], (x) => x && { ...x, pois: x.pois.filter((p) => p.id !== id) }),
      request: () => del(`/org/pois/${id}`),
      invalidate: [["farm", farmId]],
    });
  const plot = d.plots.find((p) => p.id === selected);
  const workersOf = (plotId: string) =>
    (members.data ?? []).filter((m) => d.assignments.some((a) => a.plotId === plotId && a.userId === m.userId));
  const ndviLayer = d.layers.filter((l) => l.layer === "ndvi").sort((a, b) => b.acquiredAt - a.acquiredAt)[0];
  // La capa NDVI recordada solo vale si esta estancia tiene imagen
  const layer = wantedLayer === "ndvi" && ndviLayer ? "ndvi" : "satellite";
  const kind = layer === "ndvi" ? "ndvi" : "true_color";
  const hasBasemap = d.layers.some((l) => l.layer === "true_color");
  const cropHa = d.plots.filter((p) => p.kind === "crop").reduce((a, p) => a + p.areaHa, 0);
  const pastureHa = d.plots.filter((p) => p.kind === "pasture").reduce((a, p) => a + p.areaHa, 0);

  return (
    <div className="flex h-full flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_480px]">
      <div
        role="group"
        aria-label={t("ui.viewSwitch")}
        className="flex gap-6 border-b border-linea bg-lino px-4 py-2.5 text-sm lg:hidden"
      >
        {(["map", "list"] as const).map((v) => (
          <button
            key={v}
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={`cursor-pointer underline-offset-4 ${view === v ? "font-medium text-surco underline" : "text-tinta-2"}`}
          >
            {v === "map" ? t("ui.viewMap") : t("ui.viewList")}
          </button>
        ))}
      </div>
      <div className={`relative min-h-0 flex-1 lg:h-full ${view === "list" ? "max-lg:hidden" : ""}`}>
        <FarmMap
          outline={d.farm.geometry}
          plots={d.plots}
          pois={d.pois}
          problemAreas={problems.data}
          flyTo={flyTo}
          layers={d.layers}
          layerIds={compare ? { ...pickedIds, [kind]: compare.left } : pickedIds}
          camera={compare ? camera : null}
          onCamera={compare ? setCamera : undefined}
          tilesBaseUrl={me.data?.tilesBaseUrl}
          showNdvi={layer === "ndvi"}
          selectedPlotId={selected}
          bounds={bounds}
          points={
            tab === "records"
              ? records
                  .filter((r) => r.lat !== null)
                  .map((r) => ({ id: r.id, lon: r.lon!, lat: r.lat!, color: BRAND.trigo }))
              : []
          }
          measuring={measuring}
          measurePoints={mPoints}
          measureClosed={mClosed}
          onMeasureClick={(lon, lat) => setMPoints((ps) => [...ps, [lon, lat]])}
          onMeasureClose={() => setMClosed(true)}
          drawing={mode === "draw"}
          onDrawn={(g) => {
            setDrawn(g);
            setMode("none");
          }}
          onPlotClick={(id) => {
            setSelected(id);
            setTab("plots");
            if (window.matchMedia("(max-width: 1023px)").matches) setView("list");
          }}
          onMapClick={(lon, lat) => mode === "poi" && (setPoiAt([lon, lat]), setMode("none"))}
        />
        {compare && (
          <CompareOverlay
            pct={curtain}
            onPct={setCurtain}
            camera={camera}
            onCamera={setCamera}
            mapProps={{
              outline: d.farm.geometry,
              layers: d.layers,
              layerIds: { ...pickedIds, [kind]: compare.right },
              tilesBaseUrl: me.data?.tilesBaseUrl,
              showNdvi: layer === "ndvi",
              bounds,
            }}
          />
        )}
        {/* Capas: control segmentado compacto, con leyenda cuando corresponde */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          <div className="flex w-56 flex-col gap-1.5 rounded-md border border-white/15 bg-surco/85 p-0.5 text-xs font-medium text-lino backdrop-blur">
            {!measuring ? (
              <button
                onClick={() => setMeasuring(true)}
                className="cursor-pointer rounded px-3 py-1.5 text-left hover:bg-white/10"
              >
                {t("ui.measure")}
              </button>
            ) : (
              <div className="flex flex-col gap-2 p-2.5 font-normal">
                {mPoints.length === 0 ? (
                  <p className="text-lino/80">{t("ui.measureHint")}</p>
                ) : (
                  <>
                    <p className="num">
                      {mClosed ? t("ui.measurePerimeter") : t("ui.measureDistance")}:{" "}
                      <strong className="font-semibold">{fmtDistance(pathLengthM(mPoints, mClosed))}</strong>
                    </p>
                    {mClosed && (
                      <p className="num">
                        {t("ui.area")}: <strong className="font-semibold">{fmtHa(closedAreaHa(mPoints) ?? 0)}</strong>
                      </p>
                    )}
                  </>
                )}
                <div className="flex gap-4 font-medium">
                  {mPoints.length >= 3 && !mClosed && (
                    <button
                      className="cursor-pointer underline-offset-4 hover:underline"
                      onClick={() => setMClosed(true)}
                    >
                      {t("ui.measureClose")}
                    </button>
                  )}
                  {mPoints.length > 0 && (
                    <button
                      className="cursor-pointer underline-offset-4 hover:underline"
                      onClick={() => {
                        setMClosed(false);
                        setMPoints((ps) => ps.slice(0, -1));
                      }}
                    >
                      {t("ui.measureUndo")}
                    </button>
                  )}
                  <button className="cursor-pointer underline-offset-4 hover:underline" onClick={endMeasure}>
                    {t("ui.measureDone")}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div
            role="radiogroup"
            aria-label={t("ui.layers")}
            className="flex rounded-md border border-white/15 bg-surco/85 p-0.5 text-xs font-medium text-lino backdrop-blur"
          >
            {(["satellite", "ndvi"] as const).map((l) => (
              <button
                key={l}
                role="radio"
                aria-checked={layer === l}
                disabled={l === "ndvi" && !ndviLayer}
                onClick={() => {
                  setLayer(l);
                  setCompare(null);
                  savePrefs({ layer: l });
                }}
                className={`cursor-pointer rounded px-3 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${layer === l ? "bg-lino text-surco" : "hover:bg-white/10"}`}
              >
                {l === "satellite" ? t("ui.layerSatellite") : t("ui.layerNdvi")}
              </button>
            ))}
          </div>
          <SceneControls
            layers={d.layers}
            kind={kind}
            picked={pickLayer(d.layers, kind, pickedIds[kind])?.id ?? ""}
            onPick={(id) => setPickedIds((p) => ({ ...p, [kind]: id }))}
            compare={compare}
            canCompare={layerDates(d.layers, kind).length > 1}
            onToggleCompare={() => {
              if (compare) return setCompare(null);
              setCurtain(50);
              setCompare(defaultCompare(d.layers, kind));
            }}
            onCompare={setCompare}
          />
          {layer === "ndvi" && ndviLayer && (
            <div className="w-56 rounded-md border border-white/15 bg-surco/85 p-2.5 text-[11px] text-lino backdrop-blur">
              <div
                className="h-2 rounded-sm"
                style={{ background: `linear-gradient(90deg, ${NDVI_RAMP.join(",")})` }}
              />
              <div className="num mt-1 flex justify-between text-lino/70">
                <span>{t("ui.ndviLegendLow")}</span>
                <span>{t("ui.ndviLegendHigh")}</span>
              </div>
              <p className="num mt-1.5 text-lino/70">
                {t("ui.imageDate", { date: fmtDate((pickLayer(d.layers, "ndvi", pickedIds.ndvi) ?? ndviLayer).acquiredAt) })} · Sentinel-2
              </p>
            </div>
          )}
          {!hasBasemap && (
            <p className="w-56 rounded-md bg-surco/85 p-2.5 text-[11px] text-lino/80">
              {d.imageryStatus === "pending" || d.imageryStatus === "processing"
                ? t("ui.imageryProcessing")
                : d.imageryStatus === "failed"
                  ? t("ui.imageryFailed")
                  : t("ui.noBasemap")}
            </p>
          )}
        </div>
        {mode !== "none" && mode !== "import" && (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md bg-surco px-4 py-2.5 text-sm text-lino shadow-lg">
            {mode === "poi" ? t("ui.clickMapForPoi") : t("ui.drawHint")}
            <button
              aria-label={t("ui.cancel")}
              className="cursor-pointer rounded p-0.5 hover:bg-white/10"
              onClick={() => setMode("none")}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        )}
      </div>

      <section
        className={`flex min-h-0 flex-1 flex-col gap-5 overflow-auto border-l border-linea bg-lino p-4 *:shrink-0 lg:p-6 ${view === "map" ? "max-lg:hidden" : ""}`}
      >
        <header>
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-[28px] leading-tight">{d.farm.name}</h1>
            <span className="flex shrink-0 gap-4 text-sm">
              {(farms.data?.length ?? 0) > 1 && (
                <Link to="/" className="text-tinta-2 underline-offset-4 hover:text-surco hover:underline">
                  {t("ui.allFarms")}
                </Link>
              )}
              {canEdit && (
                <Link
                  to="/estancias/nueva"
                  className="text-tinta-2 underline-offset-4 hover:text-surco hover:underline"
                >
                  {t("ui.newFarm")}
                </Link>
              )}
            </span>
          </div>
          <p className="num mt-1 text-sm text-tinta-2">
            {[d.farm.district, d.farm.department].filter(Boolean).join(", ")}
            {(d.farm.district || d.farm.department) && " · "}
            {fmtHa(d.farm.areaHa)} · {d.plots.length} {t("ui.plots").toLowerCase()}
            {cropHa > 0 && ` · ${fmtNum(cropHa)} ha ${t("ui.crop").toLowerCase()}`}
            {pastureHa > 0 && ` · ${fmtNum(pastureHa)} ha ${t("ui.pasture").toLowerCase()}`}
          </p>
        </header>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 border-b border-linea pb-5">
            <Button variant="primary" icon={PenLine} onClick={() => setMode(mode === "draw" ? "none" : "draw")}>
              {t("ui.newPlot")}
            </Button>
            <Button icon={Upload} onClick={() => setMode("import")}>
              {t("ui.importShort")}
            </Button>
            <Button icon={MapPinPlus} onClick={() => setMode(mode === "poi" ? "none" : "poi")}>
              {t("ui.addPoi")}
            </Button>
            <Link to="/estancias/$farmId/parte" params={{ farmId }} search={{ desde: undefined, hasta: undefined }}>
              <Button variant="quiet">{t("ui.tabReport")}</Button>
            </Link>
            <Button
              variant="quiet"
              onClick={() =>
                download(
                  new Blob([plotsToKml(d.plots, d.farm.name)], { type: "application/vnd.google-earth.kml+xml" }),
                  `${d.farm.name}.kml`,
                )
              }
            >
              KML
            </Button>
            <Button
              variant="quiet"
              onClick={() =>
                download(
                  new Blob([plotsToGeoJson(d.plots, d.pois)], { type: "application/geo+json" }),
                  `${d.farm.name}.geojson`,
                )
              }
            >
              GeoJSON
            </Button>
            <Button
              variant="quiet"
              onClick={async () => download(await plotsToShapefileZip(d.plots, d.pois), `${d.farm.name}-shapefile.zip`)}
            >
              Shapefile
            </Button>
          </div>
        )}

        <Tabs<Tab>
          value={tab}
          onChange={(v) => {
            setTab(v);
            savePrefs({ tab: v });
          }}
          tabs={[
            { id: "plots", label: t("ui.tabPlots"), count: d.plots.length },
            { id: "seasons", label: t("ui.tabSeasons") },
            { id: "records", label: t("ui.tabRecords") },
            { id: "tasks", label: t("ui.tabTasks") },
            { id: "climate", label: t("ui.tabClimate") },
            { id: "alerts", label: t("ui.tabAlerts"), count: alerts.data?.length || undefined },
            ...(canEdit ? [{ id: "herd" as const, label: t("ui.tabHerd") }] : []),
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
              problemAreas={(problems.data ?? []).filter((a) => a.plotId === plot.id)}
              onShowArea={(a) => {
                setFlyTo({ lon: a.lon, lat: a.lat, zoom: 17, n: Date.now() });
                setView("map");
              }}
            />
          ) : d.plots.length === 0 ? (
            <Empty title={t("ui.noPlots")} />
          ) : (
            <div>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                {unvisited.length > 0 ? (
                  <button
                    className="cursor-pointer text-left text-sm text-tinta-2 underline-offset-4 hover:text-surco hover:underline"
                    aria-pressed={onlyUnvisited}
                    onClick={() => setOnlyUnvisited(!onlyUnvisited)}
                  >
                    {onlyUnvisited
                      ? t("ui.unvisitedShowAll")
                      : t(unvisited.length === 1 ? "ui.unvisitedOne" : "ui.unvisitedMany", {
                          n: unvisited.length,
                          days: UNVISITED_DAYS,
                        })}
                  </button>
                ) : (
                  <span />
                )}
                <ExportButtons
                  data={() => ({
                    name: t("ui.plotsFile"),
                    headers: [
                      t("ui.plot"),
                      t("ui.kind"),
                      t("ui.crop"),
                      t("ui.season"),
                      t("ui.sowingDate"),
                      "ha",
                      t("ui.lastVisit"),
                    ],
                    rows: shownPlots.map((p) => [
                      p.name,
                      p.kind === "pasture" ? t("ui.pasture") : t("ui.crop"),
                      p.crop ?? p.pastureType,
                      p.season,
                      p.sowingDate,
                      Math.round(p.areaHa * 100) / 100,
                      p.lastRecordAt ? fmtDate(p.lastRecordAt) : t("ui.neverVisited"),
                    ]),
                  })}
                />
              </div>
              <PlotsTable plots={shownPlots} onSelect={setSelected} />
              <p className="mt-3 text-xs text-tinta-2">{t("ui.selectPlotHint")}</p>
              {d.pois.length > 0 && (
                <>
                  <h3 className="eyebrow mt-6 mb-2">{t("ui.pois")}</h3>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {d.pois.map((p) => {
                      return (
                        <li key={p.id} className="flex items-baseline justify-between gap-2.5">
                          <span>
                            {p.name}
                            <span className="ml-2 text-xs text-tinta-2">{tk(`ui.poiKinds_${p.kind}`)}</span>
                            {p.kind === "water" && (
                              <span
                                className={`ml-2 text-xs ${p.lastWaterLevel === "low" || p.lastWaterLevel === "dry" ? "font-medium text-peligro" : "text-tinta-2"}`}
                              >
                                {p.lastWaterLevel && p.lastWaterAt
                                  ? t("ui.poiLastWater", { level: tk(`fields.water_${p.lastWaterLevel}`).toLowerCase(), date: fmtDate(p.lastWaterAt) })
                                  : t("ui.poiNoWater")}
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-baseline gap-3 text-xs text-tinta-2">
                            <CopyCoords lon={p.lon} lat={p.lat} className="!text-xs" />
                            {canEdit && (
                              <button className="cursor-pointer hover:text-peligro" onClick={() => removePoi(p.id)}>
                                {t("ui.delete")}
                              </button>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          ))}
        {tab === "seasons" && <SeasonsPanel farmId={farmId} plots={d.plots} canEdit={canEdit} />}
        {tab === "records" && <RecordsList filters={{ farmId }} onRows={setRecords} />}
        {tab === "tasks" && <TasksPanel farmId={farmId} plots={d.plots} />}
        {tab === "climate" && <ClimatePanel farmId={farmId} />}
        {tab === "alerts" && <AlertsList farmId={farmId} />}
        {tab === "herd" && canEdit && <HerdPanel farmId={farmId} />}
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
      toast(t("ui.toastPlotSaved"));
      onSaved();
      onClose();
    },
  });
  return (
    <Modal title={t("ui.newPlot")} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className="text-sm">
          {t("ui.area")}: <strong className="num">{fmtHa(areaHa(geometry))}</strong>
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
        <Button type="submit" variant="primary" disabled={save.isPending}>
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
      toast(t("ui.toastPoiSaved"));
      onSaved();
      onClose();
    },
  });
  return (
    <Modal title={t("ui.addPoi")} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
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
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("ui.save")}
        </Button>
      </form>
    </Modal>
  );
}
