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

export function FarmPage() {
  const { farmId } = useParams({ from: "/app/estancias/$farmId" });
  const { lote } = useSearch({ from: "/app/estancias/$farmId" });
  const qc = useQueryClient();
  const farm = useFarm(farmId);
  const farms = useFarms();
  const me = useMe();
  const canEdit = !!me.data && !isFieldRole(me.data.role);
  const members = useMembers(canEdit);
  const lines = useFarmLines(farmId);
  const alerts = useAlerts({ farmId, active: true });
  const problems = useProblemAreas(farmId, canEdit);
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; zoom?: number; n: number } | null>(null);
  const [tabPref, setTab] = useState<Tab>(initialTab);
  const tab: Tab = (tabPref === "herd" || tabPref === "agro") && !canEdit ? "plots" : tabPref;
  const [onlyUnvisited, setOnlyUnvisited] = useState(false);
  const [staleDays, setStaleDaysState] = useState(() => staleDaysOrDefault(loadPrefs().staleDays));
  const snapshotRef = useRef<(() => Promise<string | null>) | null>(null);
  const [snap, setSnap] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(lote ?? null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const edit = useFarmEditing();
  const task = useTaskPicking(tab);
  const measure = useMeasure();
  const scene = useFarmScene(farm.data?.layers);
  const overlays = useFarmOverlays(farmId, !!me.data && me.data.role !== "worker" && me.data.role !== "contractor", me.data?.tilesBaseUrl);
  const pests = useFarmPests(farmId, farm.data?.plots);
  const tracks = useFarmTracks(farmId, farm.data?.plots);
  const [view, setView] = useMapListView(edit.mode, task.picking, edit.shapeEdit);
  const bounds = useFarmBounds(farm.data, selected);
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

  if (farm.isLoading) return <FarmSkeleton />;
  if (farm.error)
    return (
      <div className="p-6">
        <ErrorBox error={farm.error} />
      </div>
    );
  const d = farm.data!;
  const unvisited = stalePlots(d.plots, staleDays, Date.now());
  const shownPlots = onlyUnvisited ? unvisited : d.plots;
  const printPage = async () => {
    setSnap((await snapshotRef.current?.().catch(() => null)) ?? null);
    // Deja que React pinte la imagen antes de abrir el diálogo de impresión
    setTimeout(() => window.print(), 150);
  };
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
  const onPlotClick = (id: string) => {
    if (edit.shapeEdit) return;
    if (edit.mergeFrom) return id !== edit.mergeFrom && edit.setMergeWith(id);
    if (task.picking) return task.togglePicked(id);
    setSelected(id);
    setTab("plots");
    if (window.matchMedia("(max-width: 1023px)").matches) setView("list");
  };

  return (
    <div className={`${GRID} print:block print:h-auto`}>
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
      <FarmMapPane
        d={d}
        farmId={farmId}
        me={me.data}
        lines={lines.data}
        problemAreas={problems.data}
        flyTo={flyTo}
        bounds={bounds}
        tab={tab}
        records={records}
        selected={selected}
        unvisitedIds={onlyUnvisited ? unvisited.map((p) => p.id) : undefined}
        hidden={view === "list"}
        snapshotRef={snapshotRef}
        scene={scene}
        overlays={overlays}
        pests={pests}
        tracks={tracks}
        edit={edit}
        task={task}
        measure={measure}
        onPlotClick={onPlotClick}
        onSelectPlot={setSelected}
      />

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
        <FarmHeader d={d} farmId={farmId} farms={farms.data} canEdit={canEdit} edit={edit} onPrint={() => void printPage()} />
        <FarmTabs<Tab>
          value={tab}
          onChange={(v) => {
            setTab(v);
            savePrefs({ tab: v });
          }}
          tabs={[
            { id: "plots", label: t("ui.tabPlots"), count: d.plots.length, main: true },
            { id: "seasons", label: t("ui.tabSeasons") },
            { id: "products", label: t("ui.tabProducts") },
            { id: "records", label: t("ui.tabRecords"), main: true },
            { id: "tasks", label: t("ui.tabTasks"), main: true },
            { id: "climate", label: t("ui.tabClimate") },
            { id: "alerts", label: t("ui.tabAlerts"), count: alerts.data?.length || undefined, main: true },
            ...(canEdit ? [{ id: "herd" as const, label: t("ui.tabHerd") }] : []),
            ...(canEdit ? [{ id: "agro" as const, label: t("ui.tabAgro") }] : []),
          ]}
        />
        <TabBody
          tab={tab}
          d={d}
          farmId={farmId}
          canEdit={canEdit}
          task={task}
          onRows={setRecords}
          plots={{
            d,
            farmId,
            canEdit,
            edit,
            plot: d.plots.find((p) => p.id === selected),
            members: members.data,
            problems: problems.data,
            lines: lines.data,
            list: {
              shownPlots,
              unvisitedCount: unvisited.length,
              onlyUnvisited,
              onToggleUnvisited: () => setOnlyUnvisited(!onlyUnvisited),
              staleDays,
              onStaleDays: (n) => {
                setStaleDaysState(n);
                savePrefs({ staleDays: n });
              },
              onRemovePoi: removePoi,
            },
            onSelect: setSelected,
            onShowArea: (a) => {
              setFlyTo({ lon: a.lon, lat: a.lat, zoom: 17, n: Date.now() });
              setView("map");
            },
          }}
        />
      </section>
      <FarmDialogs d={d} farmId={farmId} edit={edit} onSelect={setSelected} />
    </div>
  );
}
