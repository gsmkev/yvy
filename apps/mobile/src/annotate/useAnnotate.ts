/** Estado y navegación del asistente de anotación. */
import { useEffect, useMemo, useState } from "react";
import { Keyboard } from "react-native";
import { router } from "expo-router";
import { flattenExtra, isWaterPoi, type MonitorCrop, type RecordKind, type Station } from "@yvy/shared";
import { containsPoint, type Area } from "@yvy/geo";
import type { Plot } from "../db/store";
import { FLOWS, stepsFor } from "../lib/annotate";
import { fieldsFor, readFormConfig } from "../lib/formConfig";
import { selectedFarmId } from "../lib/farmFilter";
import { gpsHintText, useGpsStage } from "../lib/gpsHint";
import { currentFix, guessPlots, type Fix, type PlotGuess } from "../lib/location";
import { sprayPrefill } from "../lib/sprayHours";
import type { Phase } from "./common";
import { buildSeed } from "./seed";
import { saveAnnotation } from "./save";
import { useAnnotateSource } from "./useAnnotateSource";
import { usePhotos } from "./usePhotos";

/** Todo el estado del flujo de "Anotar": de dónde se parte, en qué pantalla se está y cómo se guarda. */
export function useAnnotate() {
  const src = useAnnotateSource();
  const { params, session, db, plots, editing, scanPoi, presetKind, seasons, closeReq, existingPhotos } = src;
  const photoState = usePhotos();
  const { photos, voice, savedRef } = photoState;
  const [fix, setFix] = useState<Fix | null | "searching">(editing ? null : "searching");
  const [guesses, setGuesses] = useState<PlotGuess[]>([]);
  const [plot, setPlot] = useState<Plot | null>(
    () =>
      db.plots().find((p) => p.id === (editing ? editing.plotId : params.plotId)) ??
      (scanPoi ? plots.find((p) => containsPoint(JSON.parse(p.geometry) as Area, scanPoi.lon, scanPoi.lat)) ?? null : null),
  );
  const [kind, setKind] = useState<RecordKind | null>(editing?.kind ?? presetKind);
  const sprayPre = useMemo(() => sprayPrefill(db, plot?.farmId ?? selectedFarmId(db) ?? undefined, Date.now()), [plot?.farmId]);
  const seed = (kd: RecordKind) => buildSeed(kd, { db, seasons, taskId: params.taskId, plot, sprayPre: sprayPre as Record<string, unknown> | null });
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    editing ? flattenExtra(JSON.parse(editing.data) as Record<string, unknown>) : { ...(presetKind ? seed(presetKind) : {}), ...(scanPoi ? { poiId: scanPoi.id } : {}) },
  );
  // Plaga: primero se elige entre una observación o el monitoreo por estaciones.
  const entryFor = (kd: RecordKind): Phase => (kd === "pest" && !editing ? { name: "mode" } : { name: "step", i: 0 });
  const [phase, setPhase] = useState<Phase>(() =>
    editing ? { name: "step", i: 0 } : scanPoi ? (presetKind ? entryFor(presetKind) : { name: "kind" }) : params.kind === "rain" || params.plotId ? (params.kind ? entryFor(params.kind) : { name: "kind" }) : { name: "plot" },
  );
  const [stationMode, setStationMode] = useState(false);
  const [crop, setCrop] = useState<MonitorCrop | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [camera, setCamera] = useState(false);
  const [query, setQuery] = useState("");
  // Anotar lo mismo en varios lotes a la vez.
  const [multi, setMulti] = useState<Plot[]>([]);

  useEffect(() => {
    if (editing) return;
    currentFix().then((f) => {
      setFix(f);
      const g = guessPlots(plots, f);
      setGuesses(g);
      // Un solo candidato seguro: se elige solo y pasamos a "qué" (salvo la lluvia de la estancia, que no es de un lote).
      if (!params.plotId && !params.poiId && !params.farmLevel && g.length === 1 && g[0]!.confidence === "sure") {
        setPlot(g[0]!.plot);
        setPhase(kind ? entryFor(kind) : { name: "kind" });
      }
    });
  }, []);

  const missingPhoto = !!closeReq?.photo && photos.length + existingPhotos === 0;
  const missingLocation = !!closeReq?.location && (fix === "searching" || !fix);

  // Si el GPS tarda (arranque en frío), explicar que busca satélites y que no usa internet.
  const gpsHint = gpsHintText(useGpsStage(fix === "searching"));

  // Un registro de monitoreo por estaciones solo permite editar la nota: los conteos son de campo.
  const stationRecord = kind === "pest" && Array.isArray(values.stations);
  // Aguadas de la estancia, para preguntar de cuál es el nivel (no al editar un registro ya guardado).
  const waterPois = useMemo(
    () => (editing ? [] : db.pois(plot?.farmId ?? selectedFarmId(db) ?? undefined).filter((p) => isWaterPoi(p.kind))),
    [plot?.farmId, editing],
  );
  const vetProducts = useMemo(() => db.products().some((p) => p.type === "veterinary"), []);
  const hasMachines = useMemo(() => db.machines().length > 0, []);
  const extraFields = useMemo(() => fieldsFor(readFormConfig(db), kind), [kind]);
  // Con el punto ya escaneado no se pregunta de qué aguada es.
  const flowCtx = { waterPois: scanPoi ? 0 : waterPois.length, askSeason: seasons.length > 1, vetProducts, machines: hasMachines, extraFields };
  const steps = stationRecord ? FLOWS.pest.slice(-1) : stepsFor(kind, values, flowCtx);
  const stepIndex = phase.name === "step" ? phase.i : -1;

  const back = () => {
    Keyboard.dismiss();
    if (phase.name === "step" && phase.i > 0) return setPhase({ name: "step", i: phase.i - 1 });
    if (phase.name === "step") return presetKind || editing ? router.back() : setPhase({ name: "kind" });
    if (phase.name === "multi") return setPhase({ name: "plot" });
    if (phase.name === "mode") return params.kind ? (params.plotId ? router.back() : setPhase({ name: "plot" })) : setPhase({ name: "kind" });
    if (phase.name === "stationsCrop") return setPhase({ name: "mode" });
    if (phase.name === "stations") return setPhase({ name: "mode" });
    if (phase.name === "kind") return multi.length ? setPhase({ name: "multi" }) : params.plotId || scanPoi ? router.back() : setPhase({ name: "plot" });
    if (phase.name === "photo") return setPhase(stationMode ? { name: "stations" } : { name: "step", i: steps.length - 1 });
    router.back();
  };

  const advance = (next: Record<string, unknown> = values) => {
    Keyboard.dismiss();
    setValues(next);
    if (stepIndex < (stationRecord ? steps.length : stepsFor(kind, next, flowCtx).length) - 1) setPhase({ name: "step", i: stepIndex + 1 });
    else setPhase({ name: "photo" });
  };

  const save = () => {
    if (!kind) return;
    const r = saveAnnotation({
      db,
      userId: session.user.id,
      organizationId: session.organization.id,
      kind,
      values,
      editing,
      scanPoiFarmId: scanPoi?.farmId,
      plot,
      multi,
      fix,
      photos,
      voice,
      taskId: params.taskId,
      markSaved: () => {
        savedRef.current = true;
      },
    });
    if (r.type === "invalid") return setPhase({ name: "step", i: 0 });
    if (r.type === "none") return;
    if (r.leave) return router.back();
    setPhase({ name: "done", recordId: r.recordId });
  };

  return {
    ...src,
    ...photoState,
    fix, guesses, plot, setPlot, kind, setKind, sprayPre, seed, values, setValues, entryFor, phase, setPhase,
    stationMode, setStationMode, crop, setCrop, stations, setStations, camera, setCamera, query, setQuery, multi, setMulti,
    missingPhoto, missingLocation, gpsHint, waterPois, steps, back, advance, save,
  };
}

/** Estado completo del asistente de anotación, tal como lo devuelve `useAnnotate`. */
export type AnnotateState = ReturnType<typeof useAnnotate>;
