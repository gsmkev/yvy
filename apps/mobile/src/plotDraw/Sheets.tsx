import { Pressable, View } from "react-native";
import { Marker } from "@maplibre/maplibre-react-native";
import { t, type MessageKey } from "@yvy/shared";
import { traceLengthM } from "../lib/perimeterWalk";
import { Button, Text } from "../ui/kit";
import { T } from "../ui/theme";
import { st } from "./styles";
import type { TracePoint } from "@yvy/geo";
import type { checkDraft, V } from "../lib/plotDraft";

type Draft = ReturnType<typeof checkDraft>;

/** El texto que guía el dibujo según el estado del borrador. */
export function drawHint(draft: Draft, vertexCount: number, selected: boolean): string {
  if ("error" in draft && vertexCount >= 3) return t(`app.plot.drawErr_${draft.error}` as MessageKey);
  if (selected) return t("app.plot.drawMoveHint");
  if (vertexCount < 3) return t("app.plot.drawHint", { n: vertexCount });
  return "ha" in draft ? t("app.plot.drawArea", { value: draft.ha.toLocaleString("es-PY", { maximumFractionDigits: 1 }) }) : "";
}

/** Ficha de abajo mientras se camina el perímetro. */
export function WalkSheet({ walk, trace, walkMsg, onStart, onStop, onDrawInstead }: {
  walk: "idle" | "on";
  trace: TracePoint[];
  walkMsg: string | null;
  onStart: () => void;
  onStop: () => void;
  onDrawInstead: () => void;
}) {
  return (
    <View style={st.sheet}>
      <Text style={T.smallMedium}>
        {walk === "on" ? t("app.perim.walkRecording", { points: trace.length, m: Math.round(traceLengthM(trace)) }) : (walkMsg ?? t("app.perim.walkIntro"))}
      </Text>
      <Button big title={walk === "on" ? t("app.perim.walkStop") : t("app.perim.walkStart")} onPress={walk === "on" ? onStop : onStart} style={{ marginTop: 12 }} />
      <Button kind="text" title={t("app.perim.walkDrawInstead")} onPress={onDrawInstead} style={{ marginTop: 4 }} />
    </View>
  );
}

/** Ficha de abajo al dibujar a mano: pista, deshacer o borrar el vértice elegido, y seguir. */
export function DrawSheet({ hint, selected, vertexCount, canContinue, onUndo, onNext }: {
  hint: string;
  selected: boolean;
  vertexCount: number;
  canContinue: boolean;
  onUndo: () => void;
  onNext: () => void;
}) {
  return (
    <View style={st.sheet}>
      <Text style={T.smallMedium}>{hint}</Text>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <Button kind="secondary" title={selected ? t("app.plot.drawDeleteVertex") : t("app.plot.drawUndo")} disabled={vertexCount === 0} onPress={onUndo} />
        </View>
        <View style={{ flex: 1 }}>
          <Button kind="primary" title={t("app.plot.drawNext")} disabled={!canContinue} onPress={onNext} />
        </View>
      </View>
    </View>
  );
}

const MAX_MARKERS = 120;

/** Un punto tocable por vértice del borrador (con muchos vértices no se dibujan, para no frenar el mapa). */
export function VertexMarkers({ vs, sel, onPick }: { vs: V[]; sel: number | null; onPick: (i: number) => void }) {
  if (vs.length > MAX_MARKERS) return null;
  return (
    <>
      {vs.map((v, i) => (
        <Marker key={`${i}-${v[0]}-${v[1]}`} lngLat={v}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("app.plot.drawVertex", { n: i + 1 })}
            onPress={() => onPick(i)}
            hitSlop={14}
            style={[st.vertex, sel === i && st.vertexSel]}
          />
        </Marker>
      ))}
    </>
  );
}
