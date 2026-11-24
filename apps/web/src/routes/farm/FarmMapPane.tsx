/** Props de `FarmMapPane`: el estado de la estancia, de las capas y de las herramientas que se dibujan sobre el mapa. */
import { useRef, useState, type MutableRefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BRAND } from "@yvy/shared";
import { FarmMap, type MapPoint } from "../../components/FarmMap";
import { FullscreenButton } from "../../components/FullscreenButton";
import { MapToolbar, toolBtn } from "../../components/MapTools";
import { CompareOverlay } from "../../components/SceneControls";
import type { FarmDetail, FarmLine, Me, ProblemArea, RecordRow } from "../../lib/types";
import { LayersContent } from "./LayersContent";
import { MapHints } from "./MapHints";
import { MeasureBox } from "./MeasureBox";
import { ShapeEditBar } from "./modals";
import type { FarmEditing, TaskPicking } from "./useFarmEditing";
import type { FarmOverlays, useFarmPests, useFarmTracks } from "./useFarmOverlays";
import type { FarmScene } from "./useFarmScene";
import type { Measure } from "./useMeasure";

type Bounds = [number, number, number, number] | null;

/** Puntos que se dibujan sobre el mapa: focos de plaga o, en Registros, los registros con ubicación. */
function mapPoints(showPests: boolean, pestPts: MapPoint[], tab: string, records: RecordRow[]): MapPoint[] {
  if (showPests) return pestPts;
  if (tab !== "records") return [];
  return records
    .filter((r) => r.lat !== null)
    .map((r) => ({ id: r.id, lon: r.lon!, lat: r.lat!, color: BRAND.trigo }));
}

/** Props de `FarmMapPane`: el estado de la estancia, de las capas y de las herramientas que se dibujan sobre el mapa. */
export interface FarmMapPaneProps {
  d: FarmDetail;
  farmId: string;
  me: Me | undefined;
  lines: FarmLine[] | undefined;
  problemAreas: ProblemArea[] | undefined;
  flyTo: { lon: number; lat: number; zoom?: number; n: number } | null;
  bounds: Bounds;
  tab: string;
  records: RecordRow[];
  selected: string | null;
  unvisitedIds: string[] | undefined;
  hidden: boolean;
  snapshotRef: MutableRefObject<(() => Promise<string | null>) | null>;
  scene: FarmScene;
  overlays: FarmOverlays;
  pests: ReturnType<typeof useFarmPests>;
  tracks: ReturnType<typeof useFarmTracks>;
  edit: FarmEditing;
  task: TaskPicking;
  measure: Measure;
  onPlotClick: (id: string) => void;
  onSelectPlot: (id: string) => void;
}

/** Columna del mapa: mapa, comparación, herramientas, medición, capas y avisos flotantes. */
export function FarmMapPane(p: FarmMapPaneProps) {
  const { d, farmId, me, scene, edit, task, measure, overlays } = p;
  const qc = useQueryClient();
  const mapBox = useRef<HTMLDivElement>(null);
  const mapApi = useRef<{ zoom: (dir: 1 | -1) => void } | null>(null);
  // El panel de capas arranca cerrado: el mapa es lo primero que se ve
  const [layersOpen, setLayersOpen] = useState(false);
  const { compare, pickedIds, kind, layer, shownIndex } = scene;
  const { shapeEdit, mode } = edit;
  return (
    <div ref={mapBox} className={`relative min-h-0 flex-1 bg-lino lg:h-full print:hidden ${p.hidden ? "max-lg:hidden" : ""}`}>
      <FarmMap
        snapshotRef={p.snapshotRef}
        apiRef={mapApi}
        navControl={false}
        outline={d.farm.geometry}
        plots={d.plots}
        pois={d.pois}
        heat={p.tracks.heat}
        problemAreas={p.problemAreas}
        flyTo={p.flyTo}
        layers={d.layers}
        boundaries={overlays.boundaryLevel ? overlays.boundaries.data : null}
        customImages={overlays.customImages}
        layerIds={compare ? { ...pickedIds, [kind]: compare.left } : pickedIds}
        camera={compare ? scene.camera : null}
        onCamera={compare ? scene.setCamera : undefined}
        tilesBaseUrl={me?.tilesBaseUrl}
        showNdvi={layer === "ndvi"}
        indexKind={shownIndex}
        selectedPlotId={task.picking ? null : p.selected}
        pickedPlotIds={task.taskPlots}
        stalePlotIds={p.unvisitedIds}
        editPlot={shapeEdit}
        onEditChange={edit.setShape}
        bounds={p.bounds}
        points={mapPoints(p.pests.show, p.pests.points, p.tab, p.records)}
        measuring={measure.measuring}
        measurePoints={measure.points}
        measureClosed={measure.closed}
        onMeasureClick={measure.addPoint}
        onMeasureClose={measure.close}
        drawing={mode === "draw"}
        lines={p.lines}
        drawingLine={(!!edit.splitting && !edit.splitLine) || (edit.lineDraw && !edit.newLine)}
        onLineDrawn={(g) => (edit.splitting ? edit.setSplitLine(g) : edit.setNewLine(g))}
        onDrawn={(g) => {
          edit.setDrawn(g);
          edit.setMode("none");
        }}
        onPlotClick={p.onPlotClick}
        onMapClick={(lon, lat) => mode === "poi" && (edit.setPoiAt([lon, lat]), edit.setMode("none"))}
      />
      {compare && (
        <CompareOverlay
          pct={scene.curtain}
          onPct={scene.setCurtain}
          map={
            <FarmMap
              outline={d.farm.geometry}
              layers={d.layers}
              layerIds={{ ...pickedIds, [kind]: compare.right }}
              tilesBaseUrl={me?.tilesBaseUrl}
              showNdvi={layer === "ndvi"}
              indexKind={shownIndex}
              bounds={p.bounds}
              camera={scene.camera}
              onCamera={scene.setCamera}
            />
          }
        />
      )}
      <MapToolbar
        measuring={measure.measuring}
        onMeasure={measure.toggle}
        layersOpen={layersOpen}
        onLayers={() => setLayersOpen(!layersOpen)}
        onZoom={(dir) => mapApi.current?.zoom(dir)}
        fullscreen={<FullscreenButton target={mapBox} className={toolBtn} />}
      />
      {measure.measuring && <MeasureBox m={measure} />}
      {layersOpen && (
        <LayersContent
          d={d}
          farmId={farmId}
          me={me}
          scene={scene}
          overlays={overlays}
          pests={p.pests}
          tracks={p.tracks}
          onSelectPlot={p.onSelectPlot}
        />
      )}
      {shapeEdit && (
        <ShapeEditBar
          plotId={shapeEdit.id}
          original={shapeEdit.geometry}
          shape={edit.shape}
          onDone={edit.endShapeEdit}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["farm", farmId] });
            qc.invalidateQueries({ queryKey: ["farms"] });
          }}
        />
      )}
      <MapHints edit={edit} task={task} />
    </div>
  );
}
