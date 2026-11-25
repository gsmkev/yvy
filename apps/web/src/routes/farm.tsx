/** Pantalla principal de una estancia: mapa, panel con pestañas y herramientas de edición. */
import { useEffect, useMemo, useRef, useState } from "react";
import { isFieldRole, stalePlots, staleDaysOrDefault } from "@yvy/shared";
import { useParams, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { bboxOf, type Area } from "@yvy/geo";
import { boundsOf } from "../components/FarmMap";
import { FarmTabs } from "../components/FarmTabs";
import { ErrorBox, Skeleton, Spinner } from "../components/ui";
import { del } from "../lib/api";
import { fmtDate } from "../lib/format";
import { t } from "../lib/i18n";
import { loadPrefs, savePrefs } from "../lib/prefs";
import { useAlerts, useFarm, useFarmLines, useFarms, useMe, useMembers, useProblemAreas } from "../lib/queries";
import { deleteWithUndo } from "../lib/undo";
import type { FarmDetail, RecordRow } from "../lib/types";
import { FarmDialogs } from "./farm/FarmDialogs";
import { FarmHeader } from "./farm/FarmHeader";
import { FarmMapPane } from "./farm/FarmMapPane";
import { TabBody, TABS, type Tab } from "./farm/TabBody";
import { useFarmEditing, useTaskPicking } from "./farm/useFarmEditing";
import { useFarmOverlays, useFarmPests, useFarmTracks } from "./farm/useFarmOverlays";
import { useFarmScene } from "./farm/useFarmScene";
import { useMeasure } from "./farm/useMeasure";

const GRID = "flex h-full flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_480px]";

function FarmSkeleton() {
  return (
    <div className={GRID} aria-busy="true">
      <div className="min-h-64 flex-1 animate-pulse bg-surco/[0.06] lg:h-full" />
      <section className="flex flex-col gap-5 border-l border-linea p-4 lg:p-6">
        <Skeleton h={42} />
        <Skeleton h={20} className="w-2/3" />
        <Skeleton h={40} />
        <Spinner rows={5} h={56} />
      </section>
    </div>
  );
}

/** Pestaña inicial: la guardada, salvo que este rol no la tenga (ej. "herd" para un empleado). */
function initialTab(): Tab {
  const saved = loadPrefs().tab;
  return TABS.includes(saved as Tab) ? (saved as Tab) : "plots";
}

/** Bajo lg no entran el mapa y el panel juntos: se alterna entre uno y otro. */
function useMapListView(mode: string, picking: boolean, shapeEdit: unknown) {
  const [view, setView] = useState<"map" | "list">("map");
  useEffect(() => {
    if (mode === "draw" || mode === "poi") setView("map");
  }, [mode]);
  useEffect(() => {
    if (picking || shapeEdit) setView("map");
  }, [picking, shapeEdit]);
  return [view, setView] as const;
}

/** Con un lote elegido el mapa encuadra el lote; sin selección, la estancia entera. */
function useFarmBounds(farm: FarmDetail | undefined, selected: string | null) {
  const selectedGeometry = farm?.plots.find((p) => p.id === selected)?.geometry;
  return useMemo(() => {
    if (!farm) return null;
    if (selectedGeometry) {
      const b = bboxOf(JSON.parse(selectedGeometry) as Area);
      return [b.minLon, b.minLat, b.maxLon, b.maxLat] as [number, number, number, number];
    }
    return boundsOf(farm.farm);
  }, [farm?.farm.id, selectedGeometry]);
}

/** Estado de la pantalla de una estancia: datos, pestaña, selección, edición y capas del mapa. */
function useFarmPage(farmId: string, lote: string | undefined) {
  const farm = useFarm(farmId);
  const me = useMe();
  const canEdit = !!me.data && !isFieldRole(me.data.role);
  const [tabPref, setTab] = useState<Tab>(initialTab);
  const [selected, setSelected] = useState<string | null>(lote ?? null);
  const edit = useFarmEditing();
  const tab: Tab = (tabPref === "herd" || tabPref === "agro") && !canEdit ? "plots" : tabPref;
  const task = useTaskPicking(tab);
  const measure = useMeasure();
  const [view, setView] = useMapListView(edit.mode, task.picking, edit.shapeEdit);
  // Llegar desde el buscador con ?lote= elige ese lote
  useEffect(() => {
    if (lote) {
      setSelected(lote);
      setTab("plots");
    }
  }, [lote]);
  useEffect(() => savePrefs({ farmId }), [farmId]);
  useEffect(() => {
    if (edit.mode !== "none" && measure.measuring) measure.end();
  }, [edit.mode]);
  return {
    farm,
    me,
    canEdit,
    farms: useFarms(),
    members: useMembers(canEdit),
    lines: useFarmLines(farmId),
    alerts: useAlerts({ farmId, active: true }),
    problems: useProblemAreas(farmId, canEdit),
    tab,
    setTab,
    selected,
    setSelected,
    edit,
    task,
    measure,
    view,
    setView,
    scene: useFarmScene(farm.data?.layers),
    overlays: useFarmOverlays(farmId, !!me.data && me.data.role !== "worker" && me.data.role !== "contractor", me.data?.tilesBaseUrl),
    pests: useFarmPests(farmId, farm.data?.plots),
    tracks: useFarmTracks(farmId, farm.data?.plots),
    bounds: useFarmBounds(farm.data, selected),
  };
}

type PageState = ReturnType<typeof useFarmPage>;

/** Acciones de la estancia ya cargada: lotes sin visitar, imprimir, borrar un punto y clic en un lote. */
function useFarmActions(s: PageState, d: FarmDetail, farmId: string) {
  const qc = useQueryClient();
  const [onlyUnvisited, setOnlyUnvisited] = useState(false);
  const [staleDays, setStaleDaysState] = useState(() => staleDaysOrDefault(loadPrefs().staleDays));
  const snapshotRef = useRef<(() => Promise<string | null>) | null>(null);
  const [snap, setSnap] = useState<string | null>(null);
  const unvisited = stalePlots(d.plots, staleDays, Date.now());
  const printPage = async () => {
    setSnap((await snapshotRef.current?.().catch(() => null)) ?? null);
    // Deja que React pinte la imagen antes de abrir el diálogo de impresión
    setTimeout(() => window.print(), 150);
  };
  const removePoi = (id: string) =>
    deleteWithUndo({
      qc,
      id,
      message: t("ui.toast.poiDeleted"),
      hide: () =>
        qc.setQueryData<FarmDetail>(["farm", farmId], (x) => x && { ...x, pois: x.pois.filter((p) => p.id !== id) }),
      request: () => del(`/org/pois/${id}`),
      invalidate: [["farm", farmId]],
    });
  const onPlotClick = (id: string) => {
    if (s.edit.shapeEdit) return;
    if (s.edit.mergeFrom) return id !== s.edit.mergeFrom && s.edit.setMergeWith(id);
    if (s.task.picking) return s.task.togglePicked(id);
    s.setSelected(id);
    s.setTab("plots");
    if (window.matchMedia("(max-width: 1023px)").matches) s.setView("list");
  };
  return {
    unvisited,
    onlyUnvisited,
    setOnlyUnvisited,
    staleDays,
    setStaleDaysState,
    snapshotRef,
    snap,
    printPage,
    removePoi,
    onPlotClick,
  };
}

type PageActions = ReturnType<typeof useFarmActions>;

/** Interruptor mapa/lista que se ve bajo lg. */
function ViewSwitch({ view, setView }: { view: "map" | "list"; setView: (v: "map" | "list") => void }) {
  return (
    <div
      role="group"
      aria-label={t("ui.view.switch")}
      className="flex gap-6 border-b border-linea bg-lino px-4 py-2.5 text-sm lg:hidden print:hidden"
    >
      {(["map", "list"] as const).map((v) => (
        <button
          key={v}
          aria-pressed={view === v}
          onClick={() => setView(v)}
          className={`cursor-pointer underline-offset-4 ${view === v ? "font-medium text-surco underline" : "text-tinta-2"}`}
        >
          {v === "map" ? t("ui.view.map") : t("ui.view.list")}
        </button>
      ))}
    </div>
  );
}

/** Pestañas del panel; Hacienda y Agronomía solo para quien edita. */
function farmTabs(d: FarmDetail, canEdit: boolean, alertCount: number | undefined) {
  return [
    { id: "plots" as Tab, label: t("ui.tab.plots"), count: d.plots.length, main: true },
    { id: "seasons" as Tab, label: t("ui.tab.seasons") },
    { id: "products" as Tab, label: t("ui.tab.products") },
    { id: "records" as Tab, label: t("ui.tab.records"), main: true },
    { id: "tasks" as Tab, label: t("ui.tab.tasks"), main: true },
    { id: "climate" as Tab, label: t("ui.tab.climate") },
    { id: "alerts" as Tab, label: t("ui.tab.alerts"), count: alertCount || undefined, main: true },
    ...(canEdit ? [{ id: "herd" as Tab, label: t("ui.tab.herd") }] : []),
    ...(canEdit ? [{ id: "agro" as Tab, label: t("ui.tab.agro") }] : []),
  ];
}

/** Panel lateral: encabezado, pestañas y el cuerpo de la pestaña activa. */
function FarmPanel(props: {
  s: PageState;
  a: PageActions;
  d: FarmDetail;
  farmId: string;
  onRows: (r: RecordRow[]) => void;
  onShowArea: (a: { lon: number; lat: number }) => void;
}) {
  const { s, a, d, farmId, onRows, onShowArea } = props;
  const shownPlots = a.onlyUnvisited ? a.unvisited : d.plots;
  return (
    <section
      className={`flex min-h-0 flex-1 flex-col gap-5 overflow-auto border-l border-linea bg-lino p-4 *:shrink-0 lg:p-6 print:!flex print:overflow-visible print:border-0 print:p-0 ${s.view === "map" ? "max-lg:hidden" : ""}`}
    >
      <div className="hidden print:block">
        <p className="text-sm text-tinta-2">{t("ui.common.printedOn", { date: fmtDate(Date.now()) })}</p>
        {a.snap && (
          <img
            src={a.snap}
            alt={t("ui.print.mapAlt", { name: d.farm.name })}
            className="mt-2 max-h-[100mm] w-full rounded-md border border-linea object-cover"
          />
        )}
      </div>
      <FarmHeader d={d} farmId={farmId} farms={s.farms.data} canEdit={s.canEdit} edit={s.edit} onPrint={() => void a.printPage()} />
      <FarmTabs<Tab>
        value={s.tab}
        onChange={(v) => {
          s.setTab(v);
          savePrefs({ tab: v });
        }}
        tabs={farmTabs(d, s.canEdit, s.alerts.data?.length)}
      />
      <TabBody
        tab={s.tab}
        d={d}
        farmId={farmId}
        canEdit={s.canEdit}
        task={s.task}
        onRows={onRows}
        plots={{
          d,
          farmId,
          canEdit: s.canEdit,
          edit: s.edit,
          plot: d.plots.find((p) => p.id === s.selected),
          members: s.members.data,
          problems: s.problems.data,
          lines: s.lines.data,
          list: {
            shownPlots,
            unvisitedCount: a.unvisited.length,
            onlyUnvisited: a.onlyUnvisited,
            onToggleUnvisited: () => a.setOnlyUnvisited(!a.onlyUnvisited),
            staleDays: a.staleDays,
            onStaleDays: (n) => {
              a.setStaleDaysState(n);
              savePrefs({ staleDays: n });
            },
            onRemovePoi: a.removePoi,
          },
          onSelect: s.setSelected,
          onShowArea,
        }}
      />
    </section>
  );
}

/** Mapa y panel de una estancia. El lote elegido y la pestaña activa van en la URL. */
export function FarmPage() {
  const { farmId } = useParams({ from: "/app/estancias/$farmId" });
  const { lote } = useSearch({ from: "/app/estancias/$farmId" });
  const s = useFarmPage(farmId, lote);
  if (s.farm.isLoading) return <FarmSkeleton />;
  if (s.farm.error)
    return (
      <div className="p-6">
        <ErrorBox error={s.farm.error} />
      </div>
    );
  return <FarmLoaded s={s} d={s.farm.data!} farmId={farmId} />;
}

/** La estancia ya cargada: interruptor, mapa, panel y diálogos. */
function FarmLoaded({ s, d, farmId }: { s: PageState; d: FarmDetail; farmId: string }) {
  const a = useFarmActions(s, d, farmId);
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; zoom?: number; n: number } | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  return (
    <div className={`${GRID} print:block print:h-auto`}>
      <ViewSwitch view={s.view} setView={s.setView} />
      <FarmMapPane
        d={d}
        farmId={farmId}
        me={s.me.data}
        lines={s.lines.data}
        problemAreas={s.problems.data}
        flyTo={flyTo}
        bounds={s.bounds}
        tab={s.tab}
        records={records}
        selected={s.selected}
        unvisitedIds={a.onlyUnvisited ? a.unvisited.map((p) => p.id) : undefined}
        hidden={s.view === "list"}
        snapshotRef={a.snapshotRef}
        scene={s.scene}
        overlays={s.overlays}
        pests={s.pests}
        tracks={s.tracks}
        edit={s.edit}
        task={s.task}
        measure={s.measure}
        onPlotClick={a.onPlotClick}
        onSelectPlot={s.setSelected}
      />
      <FarmPanel
        s={s}
        a={a}
        d={d}
        farmId={farmId}
        onRows={setRecords}
        onShowArea={(p) => {
          setFlyTo({ lon: p.lon, lat: p.lat, zoom: 17, n: Date.now() });
          s.setView("map");
        }}
      />
      <FarmDialogs d={d} farmId={farmId} edit={s.edit} onSelect={s.setSelected} />
    </div>
  );
}
