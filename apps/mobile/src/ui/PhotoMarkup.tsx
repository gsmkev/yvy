/**
 * Dibujar sobre la foto antes de guardarla (F-08): flecha y círculo para señalar la plaga.
 * Al terminar se aplana en la imagen (react-native-view-shot), así la marca viaja con la foto por el mismo
 * camino de siempre: sin cambios de protocolo y se ve igual en la web, en el PDF y en WhatsApp.
 */
import { useMemo, useRef, useState, type ComponentRef } from "react";
import { Image, PanResponder, StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { LIMITS, t } from "@yvy/shared";
import { arrowHead, circleRadius, fitContain, flattenSize, isMeaningful, normalize, undo, type Mark, type Pt } from "../lib/markup";
import { Button, Text } from "./kit";
import { C, GUTTER, T } from "./theme";

type Tool = "arrow" | "circle";
const STROKE = C.peligro;
const WIDTH = 6;

/** Una marca dibujada con su "halo" blanco para que se vea sobre cualquier fondo. */
function MarkShape({ m, w, h }: { m: Mark; w: number; h: number }) {
  if (m.kind === "circle") {
    const r = circleRadius(m.center, m.edge, w, h);
    return (
      <>
        <Circle cx={m.center.x * w} cy={m.center.y * h} r={r} stroke="#fff" strokeWidth={WIDTH + 4} fill="none" />
        <Circle cx={m.center.x * w} cy={m.center.y * h} r={r} stroke={STROKE} strokeWidth={WIDTH} fill="none" />
      </>
    );
  }
  const [a, b] = arrowHead(m.from, m.to, w, h);
  const head = `${a.x},${a.y} ${m.to.x * w},${m.to.y * h} ${b.x},${b.y}`;
  return (
    <>
      <Line x1={m.from.x * w} y1={m.from.y * h} x2={m.to.x * w} y2={m.to.y * h} stroke="#fff" strokeWidth={WIDTH + 4} strokeLinecap="round" />
      <Polyline points={head} stroke="#fff" strokeWidth={WIDTH + 4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1={m.from.x * w} y1={m.from.y * h} x2={m.to.x * w} y2={m.to.y * h} stroke={STROKE} strokeWidth={WIDTH} strokeLinecap="round" />
      <Polyline points={head} stroke={STROKE} strokeWidth={WIDTH} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

export function PhotoMarkup({
  uri,
  width,
  height,
  onDone,
}: {
  uri: string;
  width: number;
  height: number;
  /** `flattenedUri` es la foto con el dibujo, o la original si no se dibujó nada. null = se descartó la foto. */
  onDone: (r: { uri: string; width: number; height: number } | null) => void;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [tool, setTool] = useState<Tool>("arrow");
  const [marks, setMarks] = useState<Mark[]>([]);
  const [draft, setDraft] = useState<Mark | null>(null);
  const [busy, setBusy] = useState(false);
  const shot = useRef<ComponentRef<typeof View>>(null);
  const start = useRef<Pt | null>(null);
  const live = useRef({ tool, size: { width: 0, height: 0 } });
  const size = fitContain(width, height, box.w, box.h);
  live.current = { tool, size };

  const pan = useMemo(() => {
    const build = (a: Pt, b: Pt): Mark => (live.current.tool === "arrow" ? { kind: "arrow", from: a, to: b } : { kind: "circle", center: a, edge: b });
    const at = (e: { nativeEvent: { locationX: number; locationY: number } }) => normalize(e.nativeEvent.locationX, e.nativeEvent.locationY, live.current.size.width, live.current.size.height);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        start.current = at(e);
        setDraft(null);
      },
      onPanResponderMove: (e) => {
        if (start.current) setDraft(build(start.current, at(e)));
      },
      onPanResponderRelease: (e) => {
        const a = start.current;
        start.current = null;
        setDraft(null);
        if (!a) return;
        const b = at(e);
        const { width: w, height: h } = live.current.size;
        if (isMeaningful(a, b, w, h)) setMarks((m) => [...m, build(a, b)]);
      },
      onPanResponderTerminate: () => {
        start.current = null;
        setDraft(null);
      },
    });
  }, []);

  const finish = async () => {
    if (marks.length === 0) return onDone({ uri, width, height });
    setBusy(true);
    try {
      const out = flattenSize(width, height, LIMITS.photos.maxLongSidePx);
      const flat = await captureRef(shot, { format: "jpg", quality: 0.92, result: "tmpfile", width: out.width, height: out.height });
      onDone({ uri: flat, width: out.width, height: out.height });
    } catch {
      // Si no se puede aplanar, se conserva la foto sin dibujo antes que perderla.
      onDone({ uri, width, height });
    }
  };

  return (
    <View style={s.root}>
      <View style={s.board} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {size.width > 0 && (
          <View ref={shot} collapsable={false} style={{ width: size.width, height: size.height }} {...pan.panHandlers}>
            <Image source={{ uri }} style={{ width: size.width, height: size.height }} resizeMode="cover" />
            <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill} pointerEvents="none">
              {marks.map((m, i) => (
                <MarkShape key={i} m={m} w={size.width} h={size.height} />
              ))}
              {draft && <MarkShape m={draft} w={size.width} h={size.height} />}
            </Svg>
          </View>
        )}
      </View>
      <View style={s.panel}>
        <Text style={[T.small, { color: C.papel, marginBottom: 10 }]}>{t("app.markupHint")}</Text>
        <View style={s.tools}>
          <Button kind={tool === "arrow" ? "primary" : "secondary"} title={t("app.markupArrow")} onPress={() => setTool("arrow")} style={{ flex: 1 }} />
          <Button kind={tool === "circle" ? "primary" : "secondary"} title={t("app.markupCircle")} onPress={() => setTool("circle")} style={{ flex: 1 }} />
        </View>
        <View style={s.tools}>
          <Button kind="secondary" title={t("app.markupUndo")} disabled={marks.length === 0 || busy} onPress={() => setMarks(undo(marks))} style={{ flex: 1 }} />
          <Button kind="secondary" title={t("ui.cancel")} disabled={busy} onPress={() => onDone(null)} style={{ flex: 1 }} />
        </View>
        <Button big title={marks.length ? t("app.markupDone") : t("app.markupNoDrawing")} loading={busy} onPress={finish} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  board: { flex: 1, alignItems: "center", justifyContent: "center" },
  panel: { padding: GUTTER, gap: 10, backgroundColor: C.tinta },
  tools: { flexDirection: "row", gap: 10 },
});
