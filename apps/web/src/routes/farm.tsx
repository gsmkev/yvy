import { useEffect, useMemo, useRef, useState } from "react";
import { isFieldRole } from "@yvy/shared";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LineString, MultiPolygon, Polygon } from "geojson";
import { MapPinPlus, PenLine, Upload, X } from "lucide-react";
import { areaHa, bboxOf, validatePolygon, type Area } from "@yvy/geo";
import { BRAND, FERT_LAYERS, FERT_LAYER_PARAM, FERT_STYLE, INDEX_KINDS, NDMI_RAMP, NDVI_RAMP, POI_KINDS, SOIL_RANGES, type FertLayerKey } from "@yvy/shared";
import { CustomLayersControl, type ActiveLayers } from "../components/CustomLayersControl";
import { BoundariesControl } from "../components/BoundariesControl";

/** Capas que se ven en Vigor: índices de vegetación (S-07) y mapas de fertilidad (A-31). */
const OVERLAYS = [...INDEX_KINDS, ...FERT_LAYERS] as const;
type Overlay = (typeof OVERLAYS)[number];
const isFert = (k: Overlay): k is FertLayerKey => (FERT_LAYERS as readonly string[]).includes(k);
import { PoiGlyph } from "../components/PoiGlyph";
import { AlertsList } from "../components/AlertsList";
import { CopyCoords } from "../components/CopyCoords";
import { ClimatePanel } from "../components/ClimatePanel";
import { boundsOf, FarmMap } from "../components/FarmMap";
import { FullscreenButton } from "../components/FullscreenButton";
import { ExportButtons } from "../components/ExportButtons";
import { ImportPlots } from "../components/ImportPlots";
import { PlotPanel } from "../components/PlotPanel";
import { LinesPanel, NewLineModal } from "../components/LinesPanel";
import { MergeModal, SplitModal } from "../components/PlotEditModals";
import { AgroPanel } from "../components/AgroPanel";
import { HerdPanel } from "../components/HerdPanel";
import { PlotsTable } from "../components/PlotsTable";
import { CompareOverlay, SceneControls } from "../components/SceneControls";
import { ProductsPanel } from "../components/ProductsPanel";
import { RecordsList } from "../components/RecordsList";
import { SeasonsPanel } from "../components/SeasonsPanel";
import { TasksPanel } from "../components/TasksPanel";
import { Button, Empty, ErrorBox, Field, Input, Modal, Select, Skeleton, Spinner, Tabs, toast } from "../components/ui";
import { del, patch, post } from "../lib/api";
import { deleteWithUndo } from "../lib/undo";
import { download, plotsToGeoJson, plotsToKml, plotsToShapefileZip } from "../lib/exports";
import { closedAreaHa, fmtDistance, pathLengthM, type LonLat } from "../lib/measure";
import { areaUnitLabel, fmtAreaValue, fmtDate, fmtHa, fmtNum } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { loadPrefs, savePrefs } from "../lib/prefs";
import { fetchAllRecords, useAlerts, useFarm, useFarmLines, useFarms, useMe, useMembers, useProblemAreas } from "../lib/queries";
import { defaultCompare, layerDates, pickLayer, type Camera } from "../lib/scenes";
import { PoiQrModal } from "../components/PoiQr";
import { heatPoints, summarizeTracks, TRACK_WINDOW_MS } from "../lib/trackHeat";
import { useCustomLayerImages, useCustomLayers } from "../lib/customLayers";
import { useBoundaries, type BoundaryLevel } from "../lib/boundaries";
import { PEST_COLORS, PEST_WINDOW_MS, pestCounts, pestPoints } from "../lib/pests";
import type { FarmDetail, Layer, RecordRow } from "../lib/types";

/** Días sin anotaciones para considerar un lote sin visitar. */
const UNVISITED_DAYS = 7;

type Tab = "plots" | "seasons" | "products" | "records" | "tasks" | "climate" | "alerts" | "herd" | "agro";
const TABS: Tab[] = ["plots", "seasons", "products", "records", "tasks", "climate", "alerts", "herd", "agro"];

export function FarmPage() {
  const { farmId } = useParams({ from: "/app/estancias/$farmId" });
  const farm = useFarm(farmId);
  const lines = useFarmLines(farmId);
  const farms = useFarms();
  const me = useMe();
  const canEdit = !!me.data && !isFieldRole(me.data.role);
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
  const tab: Tab = (tabPref === "herd" || tabPref === "agro") && !canEdit ? "plots" : tabPref;
  const [onlyUnvisited, setOnlyUnvisited] = useState(false);
  const mapBox = useRef<HTMLDivElement>(null);
  // M-05: dividir (dibuja una línea sobre el lote) y unir (se elige el lote contiguo en el mapa)
  const [splitting, setSplitting] = useState<string | null>(null);
  const [splitLine, setSplitLine] = useState<LineString | null>(null);
  const [mergeFrom, setMergeFrom] = useState<string | null>(null);
  const [mergeWith, setMergeWith] = useState<string | null>(null);
  // M-20: trazar alambrados, caminos y cañerías
  const [lineDraw, setLineDraw] = useState(false);
  const [newLine, setNewLine] = useState<LineString | null>(null);
  // U-27: captura del mapa para la hoja impresa
  const snapshotRef = useRef<(() => Promise<string | null>) | null>(null);
  const [snap, setSnap] = useState<string | null>(null);
  const printPage = async () => {
    setSnap((await snapshotRef.current?.().catch(() => null)) ?? null);
    // Deja que React pinte la imagen antes de abrir el diálogo de impresión
    setTimeout(() => window.print(), 150);
  };
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
  // M-02: edición de vértices de un lote existente
  const [shapeEdit, setShapeEdit] = useState<{ id: string; geometry: string } | null>(null);
  const [shape, setShape] = useState<Polygon | MultiPolygon | null>(null);
  const endShapeEdit = () => {
    setShapeEdit(null);
    setShape(null);
  };
  // T-01: lotes marcados en el mapa para una tarea nueva; `picking` esconde el diálogo mientras se elige.
  const [taskPlots, setTaskPlots] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const togglePicked = (id: string) =>
    setTaskPlots((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const [drawn, setDrawn] = useState<Polygon | null>(null);
  const [poiAt, setPoiAt] = useState<[number, number] | null>(null);
  const [poiQr, setPoiQr] = useState(false);
  const [wantedLayer, setLayer] = useState<"satellite" | "ndvi">(() =>
    loadPrefs().layer === "ndvi" ? "ndvi" : "satellite",
  );
  useEffect(() => savePrefs({ farmId }), [farmId]);
  // S-04: fecha elegida por tipo de capa y comparación con cortina
  const [pickedIds, setPickedIds] = useState<Partial<Record<Layer["layer"], string>>>({});
  const [indexKind, setIndexKind] = useState<Overlay>("ndvi"); // S-07
  const [boundaryLevel, setBoundaryLevel] = useState<BoundaryLevel | null>(null); // M-16
  // M-17: capas propias activas con su opacidad
  const customLayers = useCustomLayers(farmId, !!me.data && me.data.role !== "worker" && me.data.role !== "contractor");
  const [customActive, setCustomActive] = useState<ActiveLayers>({});
  const customUrls = useCustomLayerImages(Object.keys(customActive));
  const customImages = (customLayers.data ?? []).flatMap((l) =>
    l.id in customActive && l.corners && customUrls[l.id]
      ? [{ id: l.id, url: customUrls[l.id]!, corners: l.corners, opacity: customActive[l.id]! }]
      : [],
  );
  const boundaries = useBoundaries(boundaryLevel, me.data?.tilesBaseUrl);
  const [compare, setCompare] = useState<{ left: string; right: string } | null>(null);
  const [curtain, setCurtain] = useState(50);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  // A-42: focos de plaga de los últimos 30 días sobre el mapa
  const [showPests, setShowPests] = useState(false);
  const pests = useQuery({
    enabled: showPests,
    queryKey: ["pests30", farmId],
    queryFn: () => fetchAllRecords({ farmId, kind: "pest", from: Date.now() - PEST_WINDOW_MS }, 1000),
  });
  const pestPts = useMemo(
    () => (showPests && pests.data && farm.data ? pestPoints(pests.data, farm.data.plots) : []),
    [showPests, pests.data, farm.data?.plots],
  );
  // F-06: recorridas grabadas en el celular, como mapa de calor de los últimos 30 días
  const [showTracks, setShowTracks] = useState(false);
  const tracks = useQuery({
    enabled: showTracks,
    queryKey: ["tracks30", farmId],
    queryFn: () => fetchAllRecords({ farmId, kind: "track", from: Date.now() - TRACK_WINDOW_MS }, 1000),
  });
  const heat = useMemo(() => (showTracks && tracks.data ? heatPoints(tracks.data) : []), [showTracks, tracks.data]);
  const trackSummary = useMemo(
    () => (showTracks && tracks.data && farm.data ? summarizeTracks(tracks.data, farm.data.plots.map((p) => p.id)) : null),
    [showTracks, tracks.data, farm.data?.plots],
  );
  // Bajo lg no entran el mapa y el panel juntos: se alterna entre uno y otro.
  const [view, setView] = useState<"map" | "list">("map");
  useEffect(() => {
    if (mode === "draw" || mode === "poi") setView("map");
  }, [mode]);
  useEffect(() => {
    if (picking || shapeEdit) setView("map");
  }, [picking, shapeEdit]);
  useEffect(() => {
    if (!shapeEdit) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && endShapeEdit();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shapeEdit]);
  // Al salir de Tareas el diálogo se cierra: la selección del mapa no queda colgada.
  useEffect(() => {
    if (tab !== "tasks") {
      setPicking(false);
      setTaskPlots([]);
    }
  }, [tab]);
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPicking(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking]);
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
      <div className="flex h-full flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_480px]" aria-busy="true">
        <div className="min-h-64 flex-1 animate-pulse bg-surco/[0.06] lg:h-full" />
        <section className="flex flex-col gap-5 border-l border-linea p-4 lg:p-6">
          <Skeleton h={42} />
          <Skeleton h={20} className="w-2/3" />
          <Skeleton h={40} />
          <Spinner rows={5} h={56} />
        </section>
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
  const hasIndex = (k: Overlay) => d.layers.some((l) => l.layer === k);
  // Si el índice elegido no tiene imagen en esta estancia, vuelve a NDVI
  const shownIndex: Overlay = hasIndex(indexKind) ? indexKind : "ndvi";
  const ndviLayer = d.layers.filter((l) => l.layer === shownIndex).sort((a, b) => b.acquiredAt - a.acquiredAt)[0];
  // La capa de vigor recordada solo vale si esta estancia tiene imagen
  const layer = wantedLayer === "ndvi" && ndviLayer ? "ndvi" : "satellite";
  const kind = layer === "ndvi" ? shownIndex : "true_color";
  const hasBasemap = d.layers.some((l) => l.layer === "true_color");
  const cropHa = d.plots.filter((p) => p.kind === "crop").reduce((a, p) => a + p.areaHa, 0);
  const pastureHa = d.plots.filter((p) => p.kind === "pasture").reduce((a, p) => a + p.areaHa, 0);

  return (
    <div className="flex h-full flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_480px] print:block print:h-auto">
      <div
        role="group"
        aria-label={t("ui.viewSwitch")}
        className="flex gap-6 border-b border-linea bg-lino px-4 py-2.5 text-sm lg:hidden print:hidden"
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
      <div ref={mapBox} className={`relative min-h-0 flex-1 bg-lino lg:h-full print:hidden ${view === "list" ? "max-lg:hidden" : ""}`}>
        <FullscreenButton target={mapBox} className="absolute right-3 bottom-8 z-10" />
        <FarmMap
          snapshotRef={snapshotRef}
          outline={d.farm.geometry}
          plots={d.plots}
          pois={d.pois}
          heat={heat}
          problemAreas={problems.data}
          flyTo={flyTo}
          layers={d.layers}
          boundaries={boundaryLevel ? boundaries.data : null}
          customImages={customImages}
          layerIds={compare ? { ...pickedIds, [kind]: compare.left } : pickedIds}
          camera={compare ? camera : null}
          onCamera={compare ? setCamera : undefined}
          tilesBaseUrl={me.data?.tilesBaseUrl}
          showNdvi={layer === "ndvi"}
          indexKind={shownIndex}
          selectedPlotId={picking ? null : selected}
          pickedPlotIds={taskPlots}
          editPlot={shapeEdit}
          onEditChange={setShape}
          bounds={bounds}
          points={
            showPests
              ? pestPts
              : tab === "records"
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
          lines={lines.data}
          drawingLine={(!!splitting && !splitLine) || (lineDraw && !newLine)}
          onLineDrawn={(g) => (splitting ? setSplitLine(g) : setNewLine(g))}
          onDrawn={(g) => {
            setDrawn(g);
            setMode("none");
          }}
          onPlotClick={(id) => {
            if (shapeEdit) return;
            if (mergeFrom) return id !== mergeFrom && setMergeWith(id);
            if (picking) return togglePicked(id);
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
              indexKind: shownIndex,
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
          {layer === "ndvi" && OVERLAYS.filter(hasIndex).length > 1 && (
            <label className="flex w-56 flex-col gap-1 rounded-md border border-white/15 bg-surco/85 p-2.5 text-xs text-lino backdrop-blur">
              <span className="text-lino/70">{t("ui.indexPick")}</span>
              <select
                className="h-8 w-full cursor-pointer rounded border border-white/20 bg-surco px-2 text-xs text-lino outline-none focus:border-lino"
                value={shownIndex}
                onChange={(e) => {
                  setIndexKind(e.target.value as Overlay);
                  setCompare(null);
                }}
              >
                {OVERLAYS.filter(hasIndex).map((k) => (
                  <option key={k} value={k}>
                    {isFert(k) ? t(`ui.fertLayer_${k}` as "ui.fertLayer_fert_ph") : t(`ui.index_${k}`)}
                  </option>
                ))}
              </select>
              {!isFert(shownIndex) && <span className="text-lino/60">{t(`ui.indexHint_${shownIndex}`)}</span>}
            </label>
          )}
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
          <BoundariesControl
            level={boundaryLevel}
            onLevel={setBoundaryLevel}
            loading={!!boundaryLevel && boundaries.isLoading}
            missing={!!boundaryLevel && boundaries.isFetched && !boundaries.data}
          />
          <CustomLayersControl
            farmId={farmId}
            layers={customLayers.data ?? []}
            active={customActive}
            onActive={setCustomActive}
            canManage={!!me.data && ["owner", "admin", "agronomist"].includes(me.data.role)}
            farmBounds={boundsOf(d.farm)}
          />
          <button
            aria-pressed={showPests}
            onClick={() => setShowPests(!showPests)}
            className={`w-56 cursor-pointer rounded-md border border-white/15 px-3 py-1.5 text-left text-xs font-medium backdrop-blur transition-colors ${showPests ? "bg-lino text-surco" : "bg-surco/85 text-lino hover:bg-white/10"}`}
          >
            {t("ui.layerPests")}
          </button>
          {showPests && (
            <div className="w-56 rounded-md border border-white/15 bg-surco/85 p-2.5 text-[11px] text-lino backdrop-blur">
              <p className="mb-1 font-medium">{t("ui.pestsLegendTitle")}</p>
              {pests.isLoading ? (
                <p className="text-lino/70">{t("ui.loading")}</p>
              ) : pestPts.length === 0 ? (
                <p className="text-lino/70">{t("ui.pestsNone")}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {pestCounts(pestPts).map((c) => (
                    <li key={c.pest} className="num flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PEST_COLORS[c.pest] }} aria-hidden />
                      {tk(`fields.pest_${c.pest}`)}
                      <span className="ml-auto text-lino/70">{c.n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <button
            aria-pressed={showTracks}
            onClick={() => setShowTracks(!showTracks)}
            className={`w-56 cursor-pointer rounded-md border border-white/15 px-3 py-1.5 text-left text-xs font-medium backdrop-blur transition-colors ${showTracks ? "bg-lino text-surco" : "bg-surco/85 text-lino hover:bg-white/10"}`}
          >
            {t("app.layerTracks")}
          </button>
          {showTracks && (
            <div className="w-56 rounded-md border border-white/15 bg-surco/85 p-2.5 text-[11px] text-lino backdrop-blur">
              <p className="mb-1 font-medium">{t("app.tracksLegendTitle")}</p>
              {tracks.isLoading ? (
                <p className="text-lino/70">{t("ui.loading")}</p>
              ) : !trackSummary || trackSummary.walks === 0 ? (
                <p className="text-lino/70">{t("app.tracksNone")}</p>
              ) : (
                <>
                  <p className="num">
                    {t(trackSummary.walks === 1 ? "app.tracksSummaryOne" : "app.tracksSummary", {
                      n: trackSummary.walks,
                      km: trackSummary.km.toLocaleString("es-PY", { maximumFractionDigits: 1 }),
                    })}
                  </p>
                  {trackSummary.unvisited.length > 0 && (
                    <p className="mt-1 text-lino/70">
                      {t("app.tracksUnvisited", {
                        names: trackSummary.unvisited
                          .map((id) => d.plots.find((p) => p.id === id)?.name)
                          .filter(Boolean)
                          .join(", "),
                      })}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {layer === "ndvi" && ndviLayer && (
            <div className="w-56 rounded-md border border-white/15 bg-surco/85 p-2.5 text-[11px] text-lino backdrop-blur">
              <div
                className="h-2 rounded-sm"
                style={{
                  background: `linear-gradient(90deg, ${(isFert(shownIndex) ? FERT_STYLE[shownIndex].ramp : shownIndex === "ndmi" ? NDMI_RAMP : NDVI_RAMP).join(",")})`,
                }}
              />
              {isFert(shownIndex) ? (
                <>
                  <div className="num mt-1 flex justify-between text-lino/70">
                    <span>
                      {shownIndex === "fert_ph" ? t("ui.fertLegendPh") : t("ui.fertLegendLow")} {fmtNum(FERT_STYLE[shownIndex].lo)}
                    </span>
                    <span>
                      {fmtNum(FERT_STYLE[shownIndex].hi)} {FERT_STYLE[shownIndex].unit}
                    </span>
                  </div>
                  <p className="num mt-1 text-lino/70">
                    {t("ui.soilLevel_low")} &lt; {fmtNum(SOIL_RANGES[FERT_LAYER_PARAM[shownIndex]][0])} · {t("ui.soilLevel_high")} &gt;{" "}
                    {fmtNum(SOIL_RANGES[FERT_LAYER_PARAM[shownIndex]][1])}
                  </p>
                  <p className="mt-1 text-lino/60">{t("ui.fertLegendNote")}</p>
                </>
              ) : (
                <div className="num mt-1 flex justify-between text-lino/70">
                  <span>{shownIndex === "ndmi" ? t("ui.ndmiLegendLow") : t("ui.ndviLegendLow")}</span>
                  <span>{shownIndex === "ndmi" ? t("ui.ndmiLegendHigh") : t("ui.ndviLegendHigh")}</span>
                </div>
              )}
              <p className="num mt-1.5 text-lino/70">
                {t("ui.imageDate", { date: fmtDate((pickLayer(d.layers, shownIndex, pickedIds[shownIndex]) ?? ndviLayer).acquiredAt) })} · {isFert(shownIndex) ? t("ui.soilTitle") : "Sentinel-2"}
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
        {shapeEdit && (
          <ShapeEditBar
            plotId={shapeEdit.id}
            original={shapeEdit.geometry}
            shape={shape}
            onDone={endShapeEdit}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["farm", farmId] });
              qc.invalidateQueries({ queryKey: ["farms"] });
            }}
          />
        )}
        {picking && (
          <div className="absolute bottom-4 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-surco px-4 py-2.5 text-sm text-lino">
            <span>{t("ui.taskPickHint")}</span>
            <span className="num font-semibold">{t("ui.taskPickCount", { n: taskPlots.length })}</span>
            <button className="cursor-pointer font-medium underline underline-offset-4" onClick={() => setPicking(false)}>
              {t("ui.taskPickDone")}
            </button>
            {taskPlots.length > 0 && (
              <button className="cursor-pointer underline-offset-4 hover:underline" onClick={() => setTaskPlots([])}>
                {t("ui.taskPickClear")}
              </button>
            )}
          </div>
        )}
        {(splitting || mergeFrom || lineDraw) && !splitLine && !mergeWith && !newLine && (
          <div className="absolute bottom-4 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-md bg-surco px-4 py-2.5 text-sm text-lino">
            {splitting ? t("ui.splitHint") : lineDraw ? t("ui.linesHint") : t("ui.mergePick")}
            <button
              className="cursor-pointer font-medium underline underline-offset-4"
              onClick={() => {
                setSplitting(null);
                setMergeFrom(null);
                setLineDraw(false);
              }}
            >
              {t("ui.cancel")}
            </button>
          </div>
        )}
        {mode !== "none" && mode !== "import" && !picking && (
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
        className={`flex min-h-0 flex-1 flex-col gap-5 overflow-auto border-l border-linea bg-lino p-4 *:shrink-0 lg:p-6 print:!flex print:overflow-visible print:border-0 print:p-0 ${view === "map" ? "max-lg:hidden" : ""}`}
      >
        <div className="hidden print:block">
          <p className="text-sm text-tinta-2">{t("ui.printedOn", { date: fmtDate(Date.now()) })}</p>
          {snap && (
            <img
              src={snap}
              alt={t("ui.printMapAlt", { name: d.farm.name })}
              className="mt-2 max-h-[100mm] w-full rounded-md border border-linea object-cover"
            />
          )}
        </div>
        <header>
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-[28px] leading-tight">{d.farm.name}</h1>
            <span className="flex shrink-0 gap-4 text-sm print:hidden">
              <button
                type="button"
                onClick={printPage}
                className="cursor-pointer text-tinta-2 underline-offset-4 hover:text-surco hover:underline"
              >
                {t("ui.print")}
              </button>
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
            {cropHa > 0 && ` · ${fmtHa(cropHa)} ${t("ui.crop").toLowerCase()}`}
            {pastureHa > 0 && ` · ${fmtHa(pastureHa)} ${t("ui.pasture").toLowerCase()}`}
          </p>
        </header>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 border-b border-linea pb-5 print:hidden">
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
            { id: "products", label: t("ui.tabProducts") },
            { id: "records", label: t("ui.tabRecords") },
            { id: "tasks", label: t("ui.tabTasks") },
            { id: "climate", label: t("ui.tabClimate") },
            { id: "alerts", label: t("ui.tabAlerts"), count: alerts.data?.length || undefined },
            ...(canEdit ? [{ id: "herd" as const, label: t("ui.tabHerd") }] : []),
            ...(canEdit ? [{ id: "agro" as const, label: t("ui.tabAgro") }] : []),
          ]}
        />

        {tab === "plots" &&
          (plot ? (
            <PlotPanel
              key={plot.id}
              plot={plot}
              farm={d.farm}
              workers={workersOf(plot.id)}
              canEdit={canEdit}
              onClose={() => {
                setSelected(null);
                // Al volver a la lista, el foco queda en la pestaña activa y no se pierde en el vacío
                setTimeout(() => document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus(), 0);
              }}
              problemAreas={(problems.data ?? []).filter((a) => a.plotId === plot.id)}
              onShowArea={(a) => {
                setFlyTo({ lon: a.lon, lat: a.lat, zoom: 17, n: Date.now() });
                setView("map");
              }}
              onSplit={() => {
                setMergeFrom(null);
                setSplitting(plot.id);
              }}
              onMerge={() => {
                setSplitting(null);
                setMergeFrom(plot.id);
              }}
              onEditShape={() => {
                setShape(null);
                setShapeEdit({ id: plot.id, geometry: plot.geometry });
              }}
            />
          ) : d.plots.length === 0 ? (
            <Empty title={t("ui.noPlots")} />
          ) : (
            <>
            <table className="hidden w-full text-sm print:table">
              <caption className="pb-2 text-left font-serif text-lg font-semibold">{t("ui.printPlotsTitle")}</caption>
              <thead>
                <tr className="border-b border-linea text-left text-xs text-tinta-2">
                  <th className="py-1.5 font-medium">{t("ui.plot")}</th>
                  <th className="py-1.5 font-medium">{t("ui.crop")}</th>
                  <th className="py-1.5 text-right font-medium">{areaUnitLabel()}</th>
                  <th className="py-1.5 text-right font-medium">{t("ui.lastVisitShort")}</th>
                </tr>
              </thead>
              <tbody>
                {shownPlots.map((p) => (
                  <tr key={p.id} className="border-b border-linea">
                    <td className="py-1.5 font-medium">{p.name}</td>
                    <td className="py-1.5">{p.kind === "pasture" ? t("ui.pasture") : (p.crop ?? t("ui.crop"))}</td>
                    <td className="num py-1.5 text-right">{fmtAreaValue(p.areaHa)}</td>
                    <td className="num py-1.5 text-right">{p.lastRecordAt ? fmtDate(p.lastRecordAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="print:hidden">
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
              <div className="mt-6">
                <LinesPanel farmId={farmId} lines={lines.data ?? []} canEdit={!!canEdit} onDraw={() => setLineDraw(true)} />
              </div>
              <p className="mt-3 text-xs text-tinta-2">{t("ui.selectPlotHint")}</p>
              {d.pois.length > 0 && (
                <>
                  <div className="mt-6 mb-2 flex items-center justify-between gap-2">
                    <h3 className="eyebrow">{t("ui.pois")}</h3>
                    <button className="cursor-pointer text-xs text-tinta-2 underline underline-offset-4 hover:text-surco" onClick={() => setPoiQr(true)}>
                      {t("app.poiQrPrint")}
                    </button>
                  </div>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {d.pois.map((p) => {
                      return (
                        <li key={p.id} className="flex items-baseline justify-between gap-2.5">
                          <span>
                            <PoiGlyph kind={p.kind} />
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
            </>
          ))}
        {tab === "seasons" && <SeasonsPanel farmId={farmId} plots={d.plots} canEdit={canEdit} />}
        {tab === "products" && <ProductsPanel canEdit={canEdit} farmId={farmId} plots={d.plots} />}
        {tab === "records" && <RecordsList filters={{ farmId }} onRows={setRecords} />}
        {tab === "tasks" && (
          <TasksPanel
            farmId={farmId}
            plots={d.plots}
            pick={{ ids: taskPlots, setIds: setTaskPlots, picking, setPicking }}
          />
        )}
        {tab === "climate" && <ClimatePanel farmId={farmId} />}
        {tab === "alerts" && <AlertsList farmId={farmId} />}
        {tab === "herd" && canEdit && <HerdPanel farmId={farmId} />}
        {tab === "agro" && canEdit && <AgroPanel farmId={farmId} plots={d.plots} pois={d.pois} />}
      </section>

      {newLine && (
        <NewLineModal
          farmId={farmId}
          line={newLine}
          onClose={() => {
            setNewLine(null);
            setLineDraw(false);
          }}
        />
      )}
      {splitting && splitLine && d.plots.find((p) => p.id === splitting) && (
        <SplitModal
          plot={d.plots.find((p) => p.id === splitting)!}
          line={splitLine}
          onClose={() => {
            setSplitLine(null);
            setSplitting(null);
          }}
          onDone={() => {
            setSplitLine(null);
            setSplitting(null);
            setSelected(null);
            qc.invalidateQueries({ queryKey: ["farm", farmId] });
            qc.invalidateQueries({ queryKey: ["farms"] });
            toast(t("ui.splitDone"));
          }}
        />
      )}
      {mergeFrom && mergeWith && d.plots.find((p) => p.id === mergeFrom) && d.plots.find((p) => p.id === mergeWith) && (
        <MergeModal
          a={d.plots.find((p) => p.id === mergeFrom)!}
          b={d.plots.find((p) => p.id === mergeWith)!}
          onClose={() => {
            setMergeWith(null);
            setMergeFrom(null);
          }}
          onDone={() => {
            setMergeWith(null);
            setMergeFrom(null);
            setSelected(null);
            qc.invalidateQueries({ queryKey: ["farm", farmId] });
            qc.invalidateQueries({ queryKey: ["farms"] });
            toast(t("ui.mergeDone"));
          }}
        />
      )}
      {poiQr && <PoiQrModal farmName={d.farm.name} pois={d.pois} onClose={() => setPoiQr(false)} />}
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

/** Barra de la edición de vértices: superficie en vivo, validación completa (Turf) y guardado por PATCH. */
function ShapeEditBar({
  plotId,
  original,
  shape,
  onDone,
  onSaved,
}: {
  plotId: string;
  original: string;
  shape: Polygon | MultiPolygon | null;
  onDone: () => void;
  onSaved: () => void;
}) {
  const problem = shape ? validatePolygon(shape) : null;
  const save = useMutation({
    mutationFn: () =>
      patch<{ areaHa: number; warnings: { kind: "overlap" | "outside"; plotName?: string }[] }>(
        `/org/plots/${plotId}`,
        { geometry: shape },
      ),
    onSuccess: (r) => {
      onSaved();
      toast(t("ui.plotShapeSaved", { area: fmtHa(r.areaHa) }));
      for (const w of r.warnings)
        toast(
          w.kind === "overlap" ? t("ui.plotShapeOverlap", { name: w.plotName ?? "" }) : t("ui.plotShapeOutside"),
          { ms: 6000 },
        );
      onDone();
    },
  });
  const area = areaHa(shape ?? (JSON.parse(original) as Polygon | MultiPolygon));
  return (
    <div className="absolute bottom-4 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col gap-2 rounded-md bg-surco px-4 py-3 text-sm text-lino">
      <p>{t("ui.plotEditHint")}</p>
      <p className="num">
        {t("ui.area")}: <strong className="font-semibold">{fmtHa(area)}</strong>
        {shape && <span className="text-lino/70"> · {t("ui.plotEditWas", { area: fmtHa(areaHa(JSON.parse(original) as Polygon | MultiPolygon)) })}</span>}
      </p>
      {problem && <p className="font-medium text-trigo">{tk(`ui.geomError_${problem}`)}</p>}
      {save.error && <p className="font-medium text-trigo">{save.error instanceof Error ? save.error.message : String(save.error)}</p>}
      <div className="flex gap-4 font-medium">
        <button
          className="cursor-pointer underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
          disabled={!shape || !!problem || save.isPending}
          onClick={() => save.mutate()}
        >
          {t("ui.plotEditSave")}
        </button>
        <button className="cursor-pointer underline-offset-4 hover:underline" onClick={onDone}>
          {t("ui.cancel")}
        </button>
      </div>
    </div>
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
