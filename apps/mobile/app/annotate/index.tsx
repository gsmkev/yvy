/**
 * Anotar: lote → qué → una pregunta por pantalla → foto → resultado.
 * Pensado para usarse con una mano, al sol, sin señal. Nunca más de un dato por pantalla.
 */
import { useEffect, useMemo, useRef, useState, type ElementRef } from "react";
import { Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, View, type TextInput as TextInputRef } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Check, X } from "lucide-react-native";
import {
  describeRecord,
  DOSE_UNITS_FOR,
  LIMITS,
  MONITOR_CROPS,
  monitorTemplate,
  parseRecordData,
  summarizeStations,
  t,
  type DoseUnit,
  type HerdCounts,
  type MessageKey,
  type MonitorCrop,
  type ProductDose,
  type RecordKind,
  type Station,
} from "@yvy/shared";
import type { LocalPhoto, Plot, Season } from "../../src/db/store";
import { getDb } from "../../src/lib/db";
import { selectedFarmId } from "../../src/lib/farmFilter";
import { FLOWS, KINDS_FOR, SINGLE_PLOT_KINDS, stepsFor, type Step } from "../../src/lib/annotate";
import { currentFix, guessPlots, type Fix, type PlotGuess } from "../../src/lib/location";
import { processPhoto } from "../../src/lib/photos";
import { useSession } from "../../src/lib/session";
import { localChanged, useSyncStatus } from "../../src/lib/sync";
import { toastSaved } from "../../src/lib/toast";
import { seedCounts } from "../../src/lib/counter";
import { HerdCounter } from "../../src/ui/Counter";
import { Button, Row, s as k, Text, TextInput } from "../../src/ui/kit";
import { Stations } from "../../src/ui/Stations";
import { C, F, GUTTER, RADIUS, T, TOUCH } from "../../src/ui/theme";

const tr = (key: string, vars?: Record<string, string | number>) => t(key as MessageKey, vars);

/** Con más lotes que esto, la lista tiene buscador. */
const SEARCH_FROM = 8;
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

type Phase = { name: "plot" } | { name: "multi" } | { name: "kind" } | { name: "mode" } | { name: "stationsCrop" } | { name: "stations" } | { name: "step"; i: number } | { name: "photo" } | { name: "done"; recordId: string };

export default function Annotate() {
  const params = useLocalSearchParams<{ plotId?: string; kind?: RecordKind; taskId?: string; recordId?: string; farmLevel?: string }>();
  const session = useSession()!;
  const db = getDb();
  const plots = useMemo(() => db.plots(selectedFarmId(db) ?? undefined), []);
  // Edición (RF-34): el mismo registro, con sus datos cargados; se guarda con el mismo id.
  const editing = useMemo(() => (params.recordId ? db.recordById(params.recordId) : null), []);
  const existingPhotos = useMemo(() => (editing ? db.photosOfRecord(editing.id).length : 0), []);
  const maxNewPhotos = LIMITS.photos.maxPerRecord - existingPhotos;
  const [fix, setFix] = useState<Fix | null | "searching">(editing ? null : "searching");
  const [guesses, setGuesses] = useState<PlotGuess[]>([]);
  const [plot, setPlot] = useState<Plot | null>(() => db.plots().find((p) => p.id === (editing ? editing.plotId : params.plotId)) ?? null);
  const [kind, setKind] = useState<RecordKind | null>(editing?.kind ?? params.kind ?? null);
  // Campañas activas que bajaron al celular: con una sola no se pregunta, se usa esa.
  const seasons = useMemo(() => db.activeSeasons(), []);
  const seed = (kd: RecordKind): Record<string, unknown> =>
    seasons.length === 1 && FLOWS[kd].some((x) => x.kind === "season") ? { seasonId: seasons[0]!.id } : {};
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    editing ? (JSON.parse(editing.data) as Record<string, unknown>) : params.kind ? seed(params.kind) : {},
  );
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  // Plaga: primero se elige entre una observación o el monitoreo por estaciones (F-12).
  const entryFor = (kd: RecordKind): Phase => (kd === "pest" && !editing ? { name: "mode" } : { name: "step", i: 0 });
  const [phase, setPhase] = useState<Phase>(() =>
    editing ? { name: "step", i: 0 } : params.kind === "rain" || params.plotId ? (params.kind ? entryFor(params.kind) : { name: "kind" }) : { name: "plot" },
  );
  const [stationMode, setStationMode] = useState(false);
  const [crop, setCrop] = useState<MonitorCrop | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [camera, setCamera] = useState(false);
  const [query, setQuery] = useState("");
  // F-10: anotar lo mismo en varios lotes a la vez.
  const [multi, setMulti] = useState<Plot[]>([]);

  useEffect(() => {
    if (editing) return;
    currentFix().then((f) => {
      setFix(f);
      const g = guessPlots(plots, f);
      setGuesses(g);
      // Un solo candidato seguro: se elige solo y pasamos a "qué" (salvo la lluvia de la estancia, que no es de un lote).
      if (!params.plotId && !params.farmLevel && g.length === 1 && g[0]!.confidence === "sure") {
        setPlot(g[0]!.plot);
        setPhase(kind ? entryFor(kind) : { name: "kind" });
      }
    });
  }, []);

  // F-01: si el GPS tarda (arranque en frío), explicar que busca satélites y que no usa internet.
  const [gpsSlow, setGpsSlow] = useState(false);
  useEffect(() => {
    if (fix !== "searching") return setGpsSlow(false);
    const id = setTimeout(() => setGpsSlow(true), 5000);
    return () => clearTimeout(id);
  }, [fix]);

  // Un registro de monitoreo por estaciones solo permite editar la nota: los conteos son de campo.
  const stationRecord = kind === "pest" && Array.isArray(values.stations);
  // G-30: aguadas de la estancia, para preguntar de cuál es el nivel (no al editar un registro ya guardado).
  const waterPois = useMemo(
    () => (editing ? [] : db.pois(plot?.farmId ?? selectedFarmId(db) ?? undefined).filter((p) => p.kind === "water")),
    [plot?.farmId, editing],
  );
  const flowCtx = { waterPois: waterPois.length, askSeason: seasons.length > 1 };
  const steps = stationRecord ? FLOWS.pest.slice(-1) : stepsFor(kind, values, flowCtx);
  const stepIndex = phase.name === "step" ? phase.i : -1;

  const back = () => {
    Keyboard.dismiss();
    if (phase.name === "step" && phase.i > 0) return setPhase({ name: "step", i: phase.i - 1 });
    if (phase.name === "step") return params.kind || editing ? router.back() : setPhase({ name: "kind" });
    if (phase.name === "multi") return setPhase({ name: "plot" });
    if (phase.name === "mode") return params.kind ? (params.plotId ? router.back() : setPhase({ name: "plot" })) : setPhase({ name: "kind" });
    if (phase.name === "stationsCrop") return setPhase({ name: "mode" });
    if (phase.name === "stations") return setPhase({ name: "mode" });
    if (phase.name === "kind") return multi.length ? setPhase({ name: "multi" }) : params.plotId ? router.back() : setPhase({ name: "plot" });
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
    const { poiId: pickedPoi, ...answers } = values;
    const data: Record<string, unknown> = { ...answers };
    if (kind === "rain" && !editing) data.readAt = Date.now();
    // Compra: la hacienda entra de afuera, así que el potrero elegido es el destino y no hay origen.
    const entersFromOutside = kind === "herd_move" && data.reason === "compra" && !!plot;
    if (entersFromOutside) data.toPlotId = plot!.id;
    const parsed = parseRecordData(kind, data);
    if (!parsed.success) return setPhase({ name: "step", i: 0 });
    const f = fix === "searching" ? null : fix;
    const farmId = editing?.farmId ?? plot?.farmId ?? selectedFarmId(db) ?? db.farms()[0]?.id;
    if (!farmId) return;
    if (multi.length > 1 && !editing) {
      const at = Date.now();
      const ids = db.saveRecords(
        session.user.id,
        session.organization.id,
        multi.map((p) => ({
          farmId: p.farmId,
          plotId: p.id,
          poiId: null,
          kind,
          data: parsed.data as Record<string, unknown>,
          lon: f?.lon ?? null,
          lat: f?.lat ?? null,
          gpsAccuracyM: f?.accuracy ?? null,
          capturedAt: at,
        })),
        photos,
      );
      if (params.taskId) db.completeTask(params.taskId, ids[0]!);
      localChanged();
      toastSaved();
      return setPhase({ name: "done", recordId: ids[0]! });
    }
    const recordId = db.saveRecord(
      session.user.id,
      session.organization.id,
      {
        farmId,
        plotId: entersFromOutside ? null : (plot?.id ?? null),
        poiId: editing?.poiId ?? (typeof pickedPoi === "string" ? pickedPoi : null),
        kind,
        data: parsed.data as Record<string, unknown>,
        lon: editing ? editing.lon : (f?.lon ?? null),
        lat: editing ? editing.lat : (f?.lat ?? null),
        gpsAccuracyM: editing ? editing.gpsAccuracyM : (f?.accuracy ?? null),
        capturedAt: editing?.capturedAt ?? Date.now(),
      },
      photos,
      editing?.id,
    );
    if (params.taskId) db.completeTask(params.taskId, recordId);
    localChanged();
    toastSaved();
    if (editing) return router.back();
    setPhase({ name: "done", recordId });
  };

  if (camera) {
    return (
      <PhotoCamera
        onDone={(p) => {
          if (p) setPhotos((ps) => [...ps, p]);
          setCamera(false);
        }}
      />
    );
  }

  const header = (
    <Stack.Screen
      options={{
        headerShown: phase.name !== "done",
        title: plot ? plot.name : t("app.annotate"),
        headerLeft: () => (
          <Pressable onPress={back} hitSlop={12} accessibilityLabel={t("ui.cancel")} style={{ paddingHorizontal: 8 }}>
            <ArrowLeft size={24} color={C.tinta} />
          </Pressable>
        ),
        headerRight: () => (
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel={t("ui.cancel")} style={{ paddingHorizontal: 8 }}>
            <X size={22} color={C.tinta2} />
          </Pressable>
        ),
      }}
    />
  );

  // ---------- 1. Lote ----------
  if (phase.name === "plot") {
    const sure = guesses.filter((g) => g.confidence === "sure");
    const near = guesses.filter((g) => g.confidence === "near");
    const showAll = guesses.length === 0 && fix !== "searching";
    const searching = plots.length > SEARCH_FROM && query.trim() !== "";
    const needle = fold(query);
    return (
      <View style={k.screen}>
        {header}
        <ScrollView contentContainerStyle={k.pad} keyboardShouldPersistTaps="handled">
          <Text style={T.title}>{t("app.whichPlot")}</Text>
          <Text style={[T.small, { marginTop: 6, marginBottom: gpsSlow ? 6 : 20 }]}>
            {fix === "searching" ? t("app.gpsSearching") : guesses.length ? t("app.detectedByGps") : fix ? t("app.noPlotNearby") : t("app.gpsNone")}
          </Text>
          {fix === "searching" && gpsSlow && <Text style={[T.small, { marginBottom: 20 }]}>{t("app.gpsSlowHint")}</Text>}
          {plots.length > SEARCH_FROM && (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("app.plotSearch")}
              placeholderTextColor={C.tinta3}
              accessibilityLabel={t("app.plotSearch")}
              autoCorrect={false}
              clearButtonMode="while-editing"
              returnKeyType="search"
              style={st.search}
            />
          )}
          {!searching && [...sure, ...near].map((g) => (
            <Row
              key={g.plot.id}
              title={g.plot.name}
              subtitle={g.confidence === "near" ? t("app.nearBorder") : plotSubtitle(g.plot)}
              onPress={() => {
                setPlot(g.plot);
                setMulti([]);
                setPhase(kind ? entryFor(kind) : { name: "kind" });
              }}
            />
          ))}
          {guesses.length > 0 && !searching && (
            <Text style={[T.smallMedium, { marginTop: 24, marginBottom: 8 }]}>{t("app.changePlot")}</Text>
          )}
          {(showAll || guesses.length > 0 || searching) &&
            plots
              .filter((p) => (searching ? fold(p.name).includes(needle) : !guesses.some((g) => g.plot.id === p.id)))
              .map((p) => (
                <Row
                  key={p.id}
                  title={p.name}
                  subtitle={plotSubtitle(p)}
                  onPress={() => {
                    setPlot(p);
                    setMulti([]);
                    setPhase(kind ? entryFor(kind) : { name: "kind" });
                  }}
                />
              ))}
          {searching && !plots.some((p) => fold(p.name).includes(needle)) && <Text style={[T.small, { marginTop: 8 }]}>{t("app.plotSearchNone")}</Text>}
          <View style={{ height: 12 }} />
          {plots.length > 1 && <Button kind="text" title={t("app.severalPlots")} onPress={() => setPhase({ name: "multi" })} />}
          <Button
            kind="text"
            title={t("app.noPlot")}
            onPress={() => {
              setPlot(null);
              setMulti([]);
              setPhase(kind ? entryFor(kind) : { name: "kind" });
            }}
          />
        </ScrollView>
      </View>
    );
  }

  // ---------- 1b. Varios lotes ----------
  if (phase.name === "multi") {
    const toggle = (p: Plot) => setMulti((m) => (m.some((x) => x.id === p.id) ? m.filter((x) => x.id !== p.id) : [...m, p]));
    return (
      <View style={k.screen}>
        {header}
        <ScrollView contentContainerStyle={k.pad}>
          <Text style={T.title}>{t("app.severalPlotsTitle")}</Text>
          <Text style={[T.small, { marginTop: 6, marginBottom: 16 }]}>{t("app.severalPlotsHint")}</Text>
          {plots.map((p) => {
            const on = multi.some((x) => x.id === p.id);
            return (
              <Row
                key={p.id}
                title={p.name}
                subtitle={plotSubtitle(p)}
                selected={on}
                onPress={() => toggle(p)}
                left={on ? <Check size={22} color={C.accion} strokeWidth={3} /> : <View style={st.box} />}
              />
            );
          })}
          <Button
            big
            disabled={multi.length === 0}
            title={multi.length === 1 ? t("app.severalPlotsContinueOne") : t("app.severalPlotsContinue", { n: multi.length })}
            onPress={() => {
              // Un solo lote marcado es un lote común.
              setPlot(multi.length === 1 ? multi[0]! : null);
              setPhase(kind ? entryFor(kind) : { name: "kind" });
            }}
            style={{ marginTop: 20 }}
          />
        </ScrollView>
      </View>
    );
  }

  // ---------- 2. Qué ----------
  if (phase.name === "kind") {
    const rain = plot ? db.rainThisMonth(plot.farmId) : 0;
    return (
      <View style={k.screen}>
        {header}
        <ScrollView contentContainerStyle={k.pad}>
          <Text style={T.title}>{t("app.whatHappened")}</Text>
          {plot && rain > 0 && <Text style={[T.small, { marginTop: 6 }]}>{t("app.rainMonth", { mm: Math.round(rain) })}</Text>}
          <View style={{ height: 16 }} />
          {KINDS_FOR(plot?.kind ?? (multi.length > 1 && multi.every((p) => p.kind === multi[0]!.kind) ? multi[0]!.kind : null))
            .filter((kd) => !(multi.length > 1 && SINGLE_PLOT_KINDS.includes(kd)))
            .map((kd) => (
            <Row
              key={kd}
              title={t(`recordKinds.${kd}`)}
              onPress={() => {
                setKind(kd);
                setValues(seed(kd));
                setStationMode(false);
                setPhase(entryFor(kd));
              }}
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  // ---------- 2b. Plaga: una observación o por estaciones ----------
  if (phase.name === "mode") {
    const plotCrop = plot?.crop && monitorTemplate(plot.crop) ? (plot.crop as MonitorCrop) : null;
    return (
      <View style={k.screen}>
        {header}
        <ScrollView contentContainerStyle={k.pad}>
          <Text style={[T.title, { marginBottom: 16 }]}>{t("app.pestMode")}</Text>
          <Row
            title={t("app.pestModeOne")}
            onPress={() => {
              setStationMode(false);
              setPhase({ name: "step", i: 0 });
            }}
          />
          <Row
            title={t("app.pestModeStations")}
            onPress={() => {
              setStationMode(true);
              setValues({});
              if (plotCrop) setCrop(plotCrop);
              setPhase(plotCrop || crop ? { name: "stations" } : { name: "stationsCrop" });
            }}
          />
        </ScrollView>
      </View>
    );
  }

  if (phase.name === "stationsCrop") {
    return (
      <View style={k.screen}>
        {header}
        <ScrollView contentContainerStyle={k.pad}>
          <Text style={[T.title, { marginBottom: 16 }]}>{t("app.stationsCrop")}</Text>
          {MONITOR_CROPS.map((c) => (
            <Row
              key={c}
              title={tr(`app.monitorCrop_${c}`)}
              onPress={() => {
                setCrop(c);
                setPhase({ name: "stations" });
              }}
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  if (phase.name === "stations" && crop) {
    const finish = () => {
      const tpl = monitorTemplate(crop)!;
      const sum = summarizeStations(stations, tpl);
      setValues({
        pest: sum.pest,
        intensity: sum.intensity,
        ...(sum.perMeter !== undefined ? { perMeter: sum.perMeter } : {}),
        crop,
        stations,
        averages: sum.averages,
      });
      Keyboard.dismiss();
      setPhase({ name: "photo" });
    };
    return (
      <View style={k.screen}>
        {header}
        <Progress i={0} n={2} />
        <Stations crop={crop} stations={stations} onChange={setStations} onDone={finish} />
      </View>
    );
  }

  // ---------- 3. Pasos ----------
  if (phase.name === "step") {
    const step = steps[phase.i]!;
    if (step.kind === "counter")
      return (
        <View style={k.screen}>
          {header}
          <Progress i={phase.i} n={steps.length + 1} />
          <HerdCounter
            key={`${kind}-${step.key}`}
            question={tr(step.question)}
            hint={step.hint ? tr(step.hint) : undefined}
            counts={(values[step.key] as HerdCounts | undefined) ?? seedFor(kind, plot, editing)}
            onChange={(c) => setValues((v) => ({ ...v, [step.key]: c }))}
            onDone={(c) => advance({ ...values, [step.key]: c })}
          />
        </View>
      );
    if (step.kind === "poi")
      return (
        <View style={k.screen}>
          {header}
          <Progress i={phase.i} n={steps.length + 1} />
          <ScrollView contentContainerStyle={k.pad}>
            <Text style={[T.title, { marginBottom: 16 }]}>{tr(step.question)}</Text>
            {waterPois.map((p) => (
              <Row key={p.id} title={p.name} selected={values[step.key] === p.id} onPress={() => advance({ ...values, [step.key]: p.id })} />
            ))}
            <Button kind="text" title={t("app.waterPoiOther")} onPress={() => advance({ ...values, [step.key]: undefined })} style={{ marginTop: 12 }} />
          </ScrollView>
        </View>
      );
    if (step.kind === "paddock")
      return (
        <View style={k.screen}>
          {header}
          <Progress i={phase.i} n={steps.length + 1} />
          <ScrollView contentContainerStyle={k.pad}>
            <Text style={[T.title, { marginBottom: 16 }]}>{tr(step.question)}</Text>
            {db
              .plots(plot?.farmId ?? selectedFarmId(db) ?? undefined)
              .filter((p) => p.kind === "pasture" && p.id !== plot?.id)
              .map((p) => (
                <Row key={p.id} title={p.name} selected={values[step.key] === p.id} onPress={() => advance({ ...values, [step.key]: p.id })} />
              ))}
          </ScrollView>
        </View>
      );
    return (
      <View style={k.screen}>
        {header}
        <Progress i={phase.i} n={steps.length + 1} />
        <StepScreen key={`${kind}-${step.key}`} step={step} value={values[step.key]} seasons={seasons} onAnswer={(v) => advance({ ...values, [step.key]: v })} />
      </View>
    );
  }

  // ---------- 4. Foto ----------
  if (phase.name === "photo") {
    return (
      <View style={k.screen}>
        {header}
        <Progress i={stationMode ? 1 : steps.length} n={stationMode ? 2 : steps.length + 1} />
        <ScrollView contentContainerStyle={[k.pad, { flexGrow: 1 }]}>
          <Text style={T.title}>{t("app.addPhoto")}</Text>
          <Text style={[T.small, { marginTop: 6 }]}>{t("app.photosCount", { n: photos.length + existingPhotos, max: LIMITS.photos.maxPerRecord })}</Text>
          <View style={st.photos}>
            {photos.map((p, i) => (
              <View key={p.thumbUri}>
                <Image source={{ uri: p.thumbUri }} style={st.thumb} />
                <Pressable
                  accessibilityLabel={t("ui.delete")}
                  onPress={() => setPhotos(photos.filter((_, j) => j !== i))}
                  style={st.thumbX}
                  hitSlop={8}
                >
                  <X size={14} color={C.blanco} />
                </Pressable>
              </View>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          {photos.length < maxNewPhotos && (
            <Button kind="secondary" big title={t("app.takePhoto")} onPress={() => setCamera(true)} style={{ marginBottom: 12 }} />
          )}
          <Button big title={editing ? t("app.recordSave") : photos.length ? t("app.done") : t("app.skipPhoto")} onPress={save} />
        </ScrollView>
      </View>
    );
  }

  // ---------- 5. Listo ----------
  return <Done plot={plot} kind={kind!} values={values} />;
}

/** Un conteo nuevo parte de lo que se calcula para el potrero: se corrige lo que cambió. */
function seedFor(kind: RecordKind | null, plot: Plot | null, editing: unknown): HerdCounts {
  if (kind !== "herd_count" || !plot || editing) return {};
  const stock = getDb().herdStock(plot.id);
  return stock ? seedCounts(stock.counts) : {};
}

function plotSubtitle(p: Plot) {
  const last = getDb().lastVisitByPlot().get(p.id);
  if (!last) return t("app.noVisits");
  const days = Math.floor((Date.now() - last) / 86_400_000);
  return days === 0 ? t("app.lastVisitToday") : t("app.lastVisit", { days });
}

function Progress({ i, n }: { i: number; n: number }) {
  return (
    <View style={st.progress} accessibilityLabel={`${i + 1} / ${n}`}>
      {Array.from({ length: n }, (_, j) => (
        <View key={j} style={[st.progressDot, j <= i && { backgroundColor: C.accion }]} />
      ))}
    </View>
  );
}

function StepScreen({ step, value, seasons, onAnswer }: { step: Step; value: unknown; seasons: Season[]; onAnswer: (v: unknown) => void }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const input = useRef<ElementRef<typeof TextInputRef>>(null);
  useEffect(() => {
    const id = setTimeout(() => input.current?.focus(), 350);
    return () => clearTimeout(id);
  }, []);

  if (step.kind === "choice") {
    return (
      <ScrollView contentContainerStyle={k.pad}>
        <Text style={[T.title, { marginBottom: 16 }]}>{tr(step.question)}</Text>
        {step.options.map((o) => (
          <Row key={o.value} title={tr(o.label)} selected={value === o.value} onPress={() => onAnswer(o.value)} />
        ))}
        {step.optional && <Button kind="text" title={t("app.skip")} onPress={() => onAnswer(undefined)} style={{ marginTop: 12 }} />}
      </ScrollView>
    );
  }
  if (step.kind === "counter" || step.kind === "paddock" || step.kind === "poi") return null; // se dibuja con HerdCounter (pantalla completa)
  if (step.kind === "season") {
    return (
      <ScrollView contentContainerStyle={k.pad}>
        <Text style={[T.title, { marginBottom: 16 }]}>{tr(step.question)}</Text>
        {seasons.map((x) => (
          <Row key={x.id} title={x.name} selected={value === x.id} onPress={() => onAnswer(x.id)} />
        ))}
        <Button kind="text" title={t("app.skip")} onPress={() => onAnswer(undefined)} style={{ marginTop: 12 }} />
      </ScrollView>
    );
  }
  if (step.kind === "products") {
    return <ProductsStep question={step.question} value={value} onAnswer={onAnswer} />;
  }
  if (step.kind === "yesno") {
    return (
      <ScrollView contentContainerStyle={[k.pad, { flexGrow: 1 }]}>
        <Text style={T.title}>{tr(step.question)}</Text>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Button big kind="secondary" title={t("app.no")} onPress={() => onAnswer(false)} style={{ flex: 1 }} />
          <Button big title={t("app.yes")} onPress={() => onAnswer(true)} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    );
  }
  if (step.kind === "number") {
    const n = Number(text.replace(",", "."));
    const ok = text !== "" && Number.isFinite(n) && n >= (step.min ?? 0) && n <= step.max && (!step.integer || Number.isInteger(n));
    return (
      <ScrollView contentContainerStyle={[k.pad, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
        <Text style={T.title}>{tr(step.question)}</Text>
        {step.hint && <Text style={[T.small, { marginTop: 6 }]}>{tr(step.hint)}</Text>}
        <View style={st.numberRow}>
          <TextInput
            ref={input}
            value={text}
            onChangeText={(v) => setText(v.replace(/[^0-9.,]/g, "").slice(0, 6))}
            keyboardType={step.integer ? "number-pad" : "decimal-pad"}
            style={st.numberInput}
            placeholder="0"
            placeholderTextColor={C.tinta3}
            accessibilityLabel={tr(step.question)}
            onSubmitEditing={() => ok && onAnswer(n)}
          />
          <Text style={st.unit}>{step.unit}</Text>
        </View>
        <View style={{ flex: 1 }} />
        {step.optional && text === "" ? (
          <Button big kind="secondary" title={t("app.skip")} onPress={() => onAnswer(undefined)} />
        ) : (
          <Button big title={t("app.next")} disabled={!ok} onPress={() => onAnswer(n)} />
        )}
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={[k.pad, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
      <Text style={T.title}>{tr(step.question)}</Text>
      <TextInput
        ref={input}
        value={text}
        onChangeText={setText}
        multiline
        style={st.textInput}
        accessibilityLabel={tr(step.question)}
        placeholder={step.optional ? t("app.optional") : undefined}
        placeholderTextColor={C.tinta3}
      />
      <View style={{ flex: 1 }} />
      {step.optional && !text.trim() ? (
        <Button big kind="secondary" title={t("app.skip")} onPress={() => onAnswer(undefined)} />
      ) : (
        <Button big title={t("app.next")} disabled={!text.trim()} onPress={() => onAnswer(text.trim())} />
      )}
    </ScrollView>
  );
}

/** Productos de la mezcla: elegir del catálogo (o escribir uno) y una dosis por pantalla. */
function ProductsStep({ question, value, onAnswer }: { question: string; value: unknown; onAnswer: (v: unknown) => void }) {
  const catalog = useMemo(() => getDb().products(), []);
  const initial = Array.isArray(value) ? (value as ProductDose[]) : [];
  const [doses, setDoses] = useState<ProductDose[]>(initial);
  const [view, setView] = useState<"review" | "pick" | "other" | number>(initial.length ? "review" : "pick");
  const [other, setOther] = useState("");
  const [text, setText] = useState("");

  const toggle = (p: { id: string; name: string; unit: "l" | "kg" }) =>
    setDoses((ds) =>
      ds.some((d) => d.productId === p.id)
        ? ds.filter((d) => d.productId !== p.id)
        : [...ds, { productId: p.id, name: p.name, dose: 0, unit: DOSE_UNITS_FOR[p.unit][0] }],
    );
  const baseOf = (d: ProductDose): "l" | "kg" => (d.unit === "kg_ha" || d.unit === "g_ha" ? "kg" : "l");
  const go = (i: number) => {
    setText(doses[i]?.dose ? String(doses[i]!.dose).replace(".", ",") : "");
    setView(i);
  };

  if (view === "review") {
    return (
      <ScrollView contentContainerStyle={[k.pad, { flexGrow: 1 }]}>
        <Text style={T.title}>{t("app.productsReview")}</Text>
        <Text style={[T.small, { marginTop: 6, marginBottom: 16 }]}>{t("app.productsReviewHint")}</Text>
        {doses.map((d) => (
          <Row key={`${d.productId ?? d.name}`} title={d.name} subtitle={describeRecord("application", { products: [d] }).replace(`${d.name} `, "")} />
        ))}
        <View style={{ flex: 1 }} />
        <Button big title={t("app.next")} onPress={() => onAnswer(doses)} />
        <Button kind="text" title={t("app.productsChange")} onPress={() => setView("pick")} style={{ marginTop: 8 }} />
      </ScrollView>
    );
  }
  if (view === "other") {
    const name = other.trim();
    return (
      <ScrollView contentContainerStyle={[k.pad, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
        <Text style={T.title}>{t("app.productOtherQuestion")}</Text>
        <TextInput value={other} onChangeText={setOther} autoFocus style={st.search} accessibilityLabel={t("app.productOtherQuestion")} />
        <View style={{ flex: 1 }} />
        <Button
          big
          title={t("app.next")}
          disabled={!name}
          onPress={() => {
            setDoses((ds) => [...ds, { name, dose: 0, unit: "l_ha" }]);
            setOther("");
            setView("pick");
          }}
        />
      </ScrollView>
    );
  }
  if (typeof view === "number") {
    const d = doses[view]!;
    const n = Number(text.replace(",", "."));
    const ok = text !== "" && Number.isFinite(n) && n > 0 && n <= 100_000;
    const [big, small] = DOSE_UNITS_FOR[baseOf(d)];
    const unit: DoseUnit = d.unit;
    const alt = unit === big ? small : big;
    const next = () => {
      const list = doses.map((x, j) => (j === view ? { ...x, dose: n } : x));
      setDoses(list);
      if (view < list.length - 1) {
        setText(list[view + 1]!.dose ? String(list[view + 1]!.dose).replace(".", ",") : "");
        setView(view + 1);
      } else onAnswer(list);
    };
    return (
      <ScrollView contentContainerStyle={[k.pad, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
        <Text style={T.title}>{t("app.productDoseQuestion", { name: d.name })}</Text>
        <View style={st.numberRow}>
          <TextInput
            value={text}
            onChangeText={(v) => setText(v.replace(/[^0-9.,]/g, "").slice(0, 7))}
            keyboardType="decimal-pad"
            autoFocus
            style={st.numberInput}
            placeholder="0"
            placeholderTextColor={C.tinta3}
            accessibilityLabel={t("app.productDoseQuestion", { name: d.name })}
            onSubmitEditing={() => ok && next()}
          />
          <Text style={st.unit}>{tr(`fields.doseUnit_${unit}`)}</Text>
        </View>
        <Button
          kind="text"
          title={t("app.productDoseChange", { unit: tr(`fields.doseUnit_${alt}`) })}
          onPress={() => setDoses((ds) => ds.map((x, j) => (j === view ? { ...x, unit: alt } : x)))}
          style={{ marginTop: 8 }}
        />
        <View style={{ flex: 1 }} />
        <Button big title={t("app.next")} disabled={!ok} onPress={next} />
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={k.pad}>
      <Text style={T.title}>{tr(question)}</Text>
      <Text style={[T.small, { marginTop: 6, marginBottom: 16 }]}>{catalog.length ? t("app.productsHint") : t("app.productsNone")}</Text>
      {catalog.map((p) => {
        const on = doses.some((d) => d.productId === p.id);
        return (
          <Row
            key={p.id}
            title={p.name}
            subtitle={p.activeIngredient ?? undefined}
            selected={on}
            onPress={() => toggle(p)}
            left={on ? <Check size={22} color={C.accion} strokeWidth={3} /> : <View style={st.box} />}
          />
        );
      })}
      {doses
        .filter((d) => !d.productId)
        .map((d) => (
          <Row
            key={d.name}
            title={d.name}
            selected
            onPress={() => setDoses((ds) => ds.filter((x) => x !== d))}
            left={<Check size={22} color={C.accion} strokeWidth={3} />}
          />
        ))}
      <Button kind="text" title={t("app.productOther")} onPress={() => setView("other")} style={{ marginTop: 8 }} />
      <Button
        big
        disabled={doses.length === 0}
        title={t("app.productsContinue", { n: doses.length })}
        onPress={() => go(0)}
        style={{ marginTop: 16 }}
      />
    </ScrollView>
  );
}

function Done({ plot, kind, values }: { plot: Plot | null; kind: RecordKind; values: Record<string, unknown> }) {
  const st2 = useSyncStatus();
  const db = getDb();
  const rain = plot ? db.rainThisMonth(plot.farmId) : 0;
  const offline = !st2.online || st2.pending > 0;
  return (
    <View style={[k.screen, { justifyContent: "center", paddingHorizontal: GUTTER }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={st.doneMark}>
        <Check size={36} color={C.blanco} strokeWidth={3} />
      </View>
      <Text style={[T.title, { marginTop: 24 }]}>{plot ? t("app.savedTitle", { plot: plot.name }) : t(`recordKinds.${kind}`)}</Text>
      <Text style={[T.body, { marginTop: 8 }]}>{describeRecord(kind, values)}</Text>
      {kind === "rain" && rain > 0 && <Text style={[T.heading, { marginTop: 20, color: C.accionOscuro }]}>{t("app.rainMonth", { mm: Math.round(rain) })}</Text>}
      <Text style={[T.small, { marginTop: 20 }]}>{offline ? t("app.savedOffline") : t("app.savedOnline")}</Text>
      <View style={{ height: 40 }} />
      <Button big title={t("app.annotateAgain")} onPress={() => router.replace({ pathname: "/annotate", params: plot ? { plotId: plot.id } : {} })} />
      <Button kind="text" title={t("app.backToToday")} onPress={() => router.replace("/(tabs)")} style={{ marginTop: 8 }} />
    </View>
  );
}

function PhotoCamera({ onDone }: { onDone: (p: LocalPhoto | null) => void }) {
  const [perm, request] = useCameraPermissions();
  const [ref, setRef] = useState<CameraView | null>(null);
  const [busy, setBusy] = useState(false);
  if (!perm) return null;
  if (!perm.granted)
    return (
      <View style={[k.screen, k.pad, { justifyContent: "center", gap: 12 }]}>
        <Text style={T.body}>{t("app.cameraDenied")}</Text>
        <Button title={t("app.allowCamera")} onPress={request} />
        <Button kind="text" title={t("ui.cancel")} onPress={() => onDone(null)} />
      </View>
    );
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Stack.Screen options={{ headerShown: false }} />
      <CameraView ref={setRef} style={{ flex: 1 }} facing="back" />
      <View style={st.shutterRow}>
        <Pressable onPress={() => onDone(null)} accessibilityLabel={t("ui.cancel")} hitSlop={12} style={{ width: 64 }}>
          <Text style={[T.bodyMedium, { color: C.blanco }]}>{t("ui.cancel")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("app.takePhoto")}
          disabled={busy}
          style={[st.shutter, busy && { opacity: 0.5 }]}
          onPress={async () => {
            if (!ref) return;
            setBusy(true);
            try {
              const pic = await ref.takePictureAsync({ quality: 0.9 });
              onDone(await processPhoto(pic.uri, pic.width, pic.height));
            } catch {
              setBusy(false);
            }
          }}
        />
        <View style={{ width: 64 }} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  progress: { flexDirection: "row", gap: 6, paddingHorizontal: GUTTER, paddingTop: 12 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.linea },
  numberRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 28, borderBottomWidth: 2, borderBottomColor: C.tinta, paddingBottom: 6 },
  numberInput: { ...T.number, flex: 1, flexBasis: 0, minWidth: 0, width: 0, padding: 0, minHeight: 72, borderWidth: 0, backgroundColor: "transparent", ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}) },
  unit: { fontFamily: F.serifLight, fontSize: 28, color: C.tinta2 },
  textInput: { ...T.body, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}), minHeight: 140, marginTop: 20, textAlignVertical: "top", borderWidth: 1.5, borderColor: C.lineaFuerte, borderRadius: RADIUS, padding: 14, backgroundColor: C.blanco },
  search: { ...T.body, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}), minHeight: TOUCH, borderWidth: 1.5, borderColor: C.lineaFuerte, borderRadius: RADIUS, paddingHorizontal: 14, backgroundColor: C.blanco, marginBottom: 12 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 20 },
  thumb: { width: 104, height: 104, borderRadius: RADIUS },
  thumbX: { position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(30,36,25,0.75)", alignItems: "center", justifyContent: "center" },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.lineaFuerte },
  doneMark: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.accion, alignItems: "center", justifyContent: "center" },
  shutterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 28, paddingVertical: 24, backgroundColor: "#000" },
  shutter: { width: TOUCH + 20, height: TOUCH + 20, borderRadius: (TOUCH + 20) / 2, borderWidth: 6, borderColor: C.blanco, backgroundColor: C.accion },
});
