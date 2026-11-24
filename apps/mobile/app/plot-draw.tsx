/**
 * Dibujar o editar un lote (M-03): tocá el mapa para marcar los vértices; tocá un vértice para elegirlo y después
 * tocá el mapa para moverlo, o borralo. Se guarda local y se manda con señal (mutación plots.upsert).
 * Solo roles que no son empleado (PRD §9); el servidor también lo exige.
 */
import { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Camera, Map, type CameraRef } from "@maplibre/maplibre-react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { t } from "@yvy/shared";
import type { Area } from "@yvy/geo";
import { getDb } from "../src/lib/db";
import { byFarm, useFarmChoice } from "../src/lib/farmFilter";
import { useRemoteBase } from "../src/lib/useRemoteBase";
import { addVertex, checkDraft, moveVertex, removeVertex, verticesOf, type V } from "../src/lib/plotDraft";
import { useSession } from "../src/lib/session";
import { useLocal } from "../src/lib/useLocal";
import { buildDrawStyle } from "../src/plotDraw/drawStyle";
import { PlotForm } from "../src/plotDraw/PlotForm";
import { DrawSheet, drawHint, VertexMarkers, WalkSheet } from "../src/plotDraw/Sheets";
import { savePlotDraft } from "../src/plotDraw/savePlot";
import { useDraftForm } from "../src/plotDraw/useDraftForm";
import { useWalk } from "../src/plotDraw/useWalk";
import { s as k, Text } from "../src/ui/kit";
import { T } from "../src/ui/theme";
import { withWriteAccess } from "../src/ui/ReadOnlyGate";

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
  const camera = useRef<CameraRef>(null);
  const { walk, trace, walkMsg, beginWalk, endWalk, drawInstead } = useWalk(mode === "walk" && !plotId ? "idle" : "off", camera, setVs);
  const { name, setName, kind, setKind, crop, setCrop } = useDraftForm(editing, initial, setVs, camera);
  const remoteBase = useRemoteBase();

  const draft = checkDraft(vs);
  const others = byFarm(plots, farm?.id ?? null).filter((p) => p.id !== plotId);
  const style = useMemo(() => buildDrawStyle(farm, others, vs, remoteBase), [farm?.id, remoteBase, vs, others.length]);

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
    savePlotDraft({ orgId: session.organization.id, editing, farms, fallbackFarm: farm, polygon: draft.polygon, name, kind, crop });
    router.back();
  };

  const undo = () => {
    if (sel !== null) {
      setVs(removeVertex(vs, sel));
      setSel(null);
    } else setVs(vs.slice(0, -1));
  };

  if (step === "form") {
    return <PlotForm draft={draft} name={name} setName={setName} kind={kind} setKind={setKind} crop={crop} setCrop={setCrop} onSave={save} onBack={() => setStep("draw")} />;
  }

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
        {walk === "off" && <VertexMarkers vs={vs} sel={sel} onPick={(i) => setSel(sel === i ? null : i)} />}
      </Map>
      {walk !== "off" ? (
        <WalkSheet walk={walk} trace={trace} walkMsg={walkMsg} onStart={beginWalk} onStop={endWalk} onDrawInstead={drawInstead} />
      ) : (
        <DrawSheet
          hint={drawHint(draft, vs.length, sel !== null)}
          selected={sel !== null}
          vertexCount={vs.length}
          canContinue={"polygon" in draft}
          onUndo={undo}
          onNext={() => {
            setSel(null);
            setStep("form");
          }}
        />
      )}
    </View>
  );
}

/** F-29: en solo lectura esta pantalla no se abre. */
export default withWriteAccess(PlotDraw);
