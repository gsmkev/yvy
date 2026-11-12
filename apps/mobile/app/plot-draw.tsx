/**
 * Dibujar o editar un lote (M-03): tocá el mapa para marcar los vértices; tocá un vértice para elegirlo y después
 * tocá el mapa para moverlo, o borralo. Se guarda local y se manda con señal (mutación plots.upsert).
 * Solo roles que no son empleado (PRD §9); el servidor también lo exige.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Camera, Map, Marker, type CameraRef, type StyleSpecification } from "@maplibre/maplibre-react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { CROPS, PLOT_KINDS, t, type MessageKey } from "@yvy/shared";
import { containsPoint, traceToPolygon, type Area, type TracePoint } from "@yvy/geo";
import { getDb } from "../src/lib/db";
import { byFarm, useFarmChoice } from "../src/lib/farmFilter";
import { layerSource, tilesBaseUrl } from "../src/lib/offline";
import { addVertex, checkDraft, moveVertex, removeVertex, verticesOf, type V } from "../src/lib/plotDraft";
import { useSession } from "../src/lib/session";
import { appendFix, startWalk, traceLengthM } from "../src/lib/perimeterWalk";
import { localChanged } from "../src/lib/sync";
import { toastSaved } from "../src/lib/toast";
import { useLocal } from "../src/lib/useLocal";
import { Button, RadioGroup, Row, s as k, Text, TextInput } from "../src/ui/kit";
import { C, GUTTER, RADIUS, T } from "../src/ui/theme";
import { withWriteAccess } from "../src/ui/ReadOnlyGate";

const MAX_MARKERS = 120;

function PlotDraw() {
  const session = useSession();
  const { plotId, mode } = useLocalSearchParams<{ plotId?: string; mode?: string }>();
  const { current } = useFarmChoice();
  const plots = useLocal(() => getDb().plots());
  const farms = useLocal(() => getDb().farms());
  const editing = plotId ? plots.find((p) => p.id === plotId) : undefined;
  const farm = (editing && farms.find((f) => f.id === editing.farmId)) || current || farms[0];
  const initial = useMemo(() => (editing ? verticesOf(JSON.parse(editing.geometry) as Area) : []), [editing?.id]);
  const [vs, setVs] = useState<V[]>(initial ?? []);
  const [sel, setSel] = useState<number | null>(null);
  const [step, setStep] = useState<"draw" | "form">("draw");
  // M-04: caminar el borde con el GPS. idle = todavía no empezó, on = grabando, off = ya cerrado (se ajusta como cualquier dibujo)
  const [walk, setWalk] = useState<"idle" | "on" | "off">(mode === "walk" && !plotId ? "idle" : "off");
  const [trace, setTrace] = useState<TracePoint[]>([]);
  const [walkMsg, setWalkMsg] = useState<string | null>(null);
  const walker = useRef<{ stop: () => void } | null>(null);
  useEffect(() => () => walker.current?.stop(), []);
  const [name, setName] = useState(editing?.name ?? "");
  const [kind, setKind] = useState<(typeof PLOT_KINDS)[number]>(editing?.kind ?? "crop");
  const [crop, setCrop] = useState<(typeof CROPS)[number] | null>(editing?.crop ?? null);
  const [remoteBase, setRemoteBase] = useState<string | null>(null);
  const camera = useRef<CameraRef>(null);
  const seeded = useRef(false);
  useEffect(() => {
    tilesBaseUrl().then(setRemoteBase, () => setRemoteBase(null));
  }, []);
  // El lote editado llega de la base local un instante después de abrir la pantalla
  useEffect(() => {
    if (editing && !seeded.current) {
      seeded.current = true;
      setVs(initial ?? []);
      setName(editing.name);
      setKind(editing.kind);
      setCrop(editing.crop ?? null);
      camera.current?.fitBounds([editing.minLon, editing.minLat, editing.maxLon, editing.maxLat], { padding: { top: 60, bottom: 220, left: 60, right: 60 }, duration: 0 });
    }
  }, [editing?.id]);

  const beginWalk = async () => {
    setWalkMsg(null);
    setTrace([]);
    setVs([]);
    const w = await startWalk((fix) => {
      setTrace((cur) => {
        const next = appendFix(cur, fix);
        if (next !== cur) setVs(next.map((p) => [p.lon, p.lat] as V));
        return next;
      });
      camera.current?.flyTo({ center: [fix.lon, fix.lat], zoom: 18, duration: 400 });
    });
    if (w === "denied") return setWalkMsg(t("app.perimWalkDenied"));
    walker.current = w;
    setWalk("on");
  };
  const endWalk = () => {
    walker.current?.stop();
    walker.current = null;
    const r = traceToPolygon(trace);
    if ("error" in r) {
      setWalkMsg(r.error === "too_few_points" ? t("app.perimWalkTooShort") : r.error === "self_intersection" ? t("app.perimWalkCrossed") : t("app.perimWalkInvalid"));
      setWalk("idle");
      return;
    }
    // El perímetro caminado queda como un dibujo común: se ajusta vértice por vértice y sigue el flujo de M-03
    setVs(r.polygon.coordinates[0]!.slice(0, -1).map((p) => [p[0]!, p[1]!] as V));
    setWalk("off");
  };

  const draft = checkDraft(vs);
  const others = byFarm(plots, farm?.id ?? null).filter((p) => p.id !== plotId);

  const style = useMemo<StyleSpecification>(() => {
    const sources: StyleSpecification["sources"] = {};
    const layers: StyleSpecification["layers"] = [{ id: "bg", type: "background", paint: { "background-color": "#141a12" } }];
    if (farm) {
      const src = layerSource(farm.id, "true_color", remoteBase);
      if (src) {
        sources.base = { type: "raster", url: src.url, tileSize: 256 };
        layers.push({ id: "base", type: "raster", source: "base" });
      }
      sources.farm = { type: "geojson", data: { type: "Feature", properties: {}, geometry: JSON.parse(farm.geometry) } };
      layers.push({ id: "farm", type: "line", source: "farm", paint: { "line-color": "rgba(255,255,255,0.9)", "line-width": 2 } });
    }
    sources.others = {
      type: "geojson",
      data: { type: "FeatureCollection", features: others.map((p) => ({ type: "Feature" as const, properties: {}, geometry: JSON.parse(p.geometry) })) },
    };
    layers.push({ id: "others", type: "line", source: "others", paint: { "line-color": "rgba(255,255,255,0.55)", "line-width": 1.5 } });
    const ring = vs.length >= 3 ? [...vs, vs[0]!] : vs;
    sources.draft = {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          ...(vs.length >= 3 ? [{ type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring] } }] : []),
          ...(vs.length >= 2 ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: ring } }] : []),
        ],
      },
    };
    layers.push(
      { id: "draft-fill", type: "fill", source: "draft", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#D9A93A", "fill-opacity": 0.25 } },
      // Pendiente = borde punteado trigo; el lote guardado y sincronizado va sólido
      { id: "draft-line", type: "line", source: "draft", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#D9A93A", "line-width": 3, "line-dasharray": [2, 1.5] } },
    );
    return { version: 8, sources, layers };
  }, [farm?.id, remoteBase, vs, others.length]);

  if (!session || session.organization.role === "worker") return null;
  if (!farm) return null;
  if (editing && !initial) {
    return (
      <View style={[k.screen, k.pad]}>
        <Stack.Screen options={{ title: "" }} />
        <Text style={T.body}>{t("app.plotDrawNoEdit")}</Text>
      </View>
    );
  }

  const onMap = (lon: number, lat: number) => {
    if (walk !== "off") return;
    if (sel !== null) {
      setVs(moveVertex(vs, sel, [lon, lat]));
      setSel(null);
      return;
    }
    setVs(addVertex(vs, [lon, lat], !!editing));
  };

  const save = () => {
    if (!("polygon" in draft) || !name.trim()) return;
    const first = draft.polygon.coordinates[0]![0]!;
    // La estancia que contiene el primer vértice; si no, la elegida
    const target = farms.find((f) => containsPoint(JSON.parse(f.geometry) as Area, first[0]!, first[1]!)) ?? farm;
    getDb().savePlot(session.organization.id, {
      id: editing?.id,
      farmId: editing?.farmId ?? target.id,
      name,
      kind,
      crop: kind === "crop" ? crop : null,
      geometry: draft.polygon,
    });
    localChanged();
    toastSaved();
    router.back();
  };

  if (step === "form") {
    return (
      <ScrollView style={k.screen} contentContainerStyle={k.pad} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: "" }} />
        <Text style={T.title}>{t("app.plotDrawData")}</Text>
        {"ha" in draft && (
          <Text style={[T.small, { marginTop: 6 }]}>
            {t("ui.ha", { value: draft.ha.toLocaleString("es-PY", { maximumFractionDigits: 1 }) })}
          </Text>
        )}
        <Text style={[T.heading, { marginTop: 24, marginBottom: 8 }]}>{t("app.plotDrawName")}</Text>
        <TextInput
          value={name}
          onChangeText={(v) => setName(v.slice(0, 120))}
          placeholder={t("app.plotDrawNamePlaceholder")}
          placeholderTextColor={C.tinta3}
          accessibilityLabel={t("app.plotDrawName")}
          style={st.input}
        />
        <Text style={[T.heading, { marginTop: 24, marginBottom: 4 }]}>{t("app.plotDrawKind")}</Text>
        <RadioGroup label={t("app.plotDrawKind")}>
          {PLOT_KINDS.map((kd) => (
            <Row key={kd} choice="radio" title={kd === "crop" ? t("ui.crop") : t("ui.pasture")} selected={kind === kd} onPress={() => setKind(kd)} />
          ))}
        </RadioGroup>
        {kind === "crop" && (
          <>
            <Text style={[T.heading, { marginTop: 24, marginBottom: 4 }]}>{t("app.plotDrawCrop")}</Text>
            <RadioGroup label={t("app.plotDrawCrop")}>
              {CROPS.map((c) => (
                <Row key={c} choice="radio" title={t(`fields.crop_${c}` as MessageKey)} selected={crop === c} onPress={() => setCrop(c)} />
              ))}
            </RadioGroup>
          </>
        )}
        <Button big title={t("app.plotDrawSave")} disabled={!name.trim() || !("polygon" in draft)} onPress={save} style={{ marginTop: 28 }} />
        <Button kind="text" title={t("app.plotDrawBack")} onPress={() => setStep("draw")} style={{ marginTop: 4 }} />
      </ScrollView>
    );
  }

  const hint =
    "error" in draft && vs.length >= 3
      ? t(`app.plotDrawErr_${draft.error}` as MessageKey)
      : sel !== null
        ? t("app.plotDrawMoveHint")
        : vs.length < 3
          ? t("app.plotDrawHint", { n: vs.length })
          : "ha" in draft
            ? t("app.plotDrawArea", { value: draft.ha.toLocaleString("es-PY", { maximumFractionDigits: 1 }) })
            : "";

  return (
    <View style={{ flex: 1, backgroundColor: "#141a12" }}>
      <Stack.Screen options={{ title: "" }} />
      <Map
        style={{ flex: 1 }}
        mapStyle={style}
        attribution={false}
        logo={false}
        compass={false}
        onPress={(e) => {
          const [lon, lat] = e.nativeEvent.lngLat as unknown as [number, number];
          onMap(lon, lat);
        }}
      >
        <Camera ref={camera} initialViewState={{ bounds: [farm.minLon, farm.minLat, farm.maxLon, farm.maxLat], padding: { top: 40, bottom: 220, left: 24, right: 24 } }} />
        {walk === "off" && vs.length <= MAX_MARKERS &&
          vs.map((v, i) => (
            <Marker key={`${i}-${v[0]}-${v[1]}`} lngLat={v}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("app.plotDrawVertex", { n: i + 1 })}
                onPress={() => setSel(sel === i ? null : i)}
                hitSlop={14}
                style={[st.vertex, sel === i && st.vertexSel]}
              />
            </Marker>
          ))}
      </Map>
      {walk !== "off" ? (
        <View style={st.sheet}>
          <Text style={T.smallMedium}>
            {walk === "on" ? t("app.perimWalkRecording", { points: trace.length, m: Math.round(traceLengthM(trace)) }) : (walkMsg ?? t("app.perimWalkIntro"))}
          </Text>
          <Button
            big
            title={walk === "on" ? t("app.perimWalkStop") : t("app.perimWalkStart")}
            onPress={walk === "on" ? endWalk : beginWalk}
            style={{ marginTop: 12 }}
          />
          <Button kind="text" title={t("app.perimWalkDrawInstead")} onPress={() => { walker.current?.stop(); setWalk("off"); }} style={{ marginTop: 4 }} />
        </View>
      ) : (
      <View style={st.sheet}>
        <Text style={T.smallMedium}>{hint}</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Button
              kind="secondary"
              title={sel !== null ? t("app.plotDrawDeleteVertex") : t("app.plotDrawUndo")}
              disabled={vs.length === 0}
              onPress={() => {
                if (sel !== null) {
                  setVs(removeVertex(vs, sel));
                  setSel(null);
                } else setVs(vs.slice(0, -1));
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              kind="primary"
              title={t("app.plotDrawNext")}
              disabled={!("polygon" in draft)}
              onPress={() => {
                setSel(null);
                setStep("form");
              }}
            />
          </View>
        </View>
      </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  input: { ...T.body, minHeight: 56, borderWidth: 1.5, borderColor: C.lineaFuerte, borderRadius: RADIUS, paddingHorizontal: 14, backgroundColor: C.blanco },
  sheet: { position: "absolute", left: 12, right: 12, bottom: 12, backgroundColor: C.papel, borderRadius: RADIUS + 4, padding: GUTTER, elevation: 8 },
  vertex: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#D9A93A", borderWidth: 2.5, borderColor: "#ffffff" },
  vertexSel: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#D2462B" },
});

/** F-29: en solo lectura esta pantalla no se abre. */
export default withWriteAccess(PlotDraw);
