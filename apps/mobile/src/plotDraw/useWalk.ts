import { useEffect, useRef, useState, type RefObject } from "react";
import type { CameraRef } from "@maplibre/maplibre-react-native";
import { t } from "@yvy/shared";
import { traceToPolygon, type TracePoint } from "@yvy/geo";
import { appendFix, startWalk } from "../lib/perimeterWalk";
import type { V } from "../lib/plotDraft";

/** M-04: caminar el borde con el GPS. idle = todavía no empezó, on = grabando, off = ya cerrado (se ajusta como cualquier dibujo). */
export function useWalk(initial: "idle" | "off", camera: RefObject<CameraRef | null>, setVs: (vs: V[]) => void) {
  const [walk, setWalk] = useState<"idle" | "on" | "off">(initial);
  const [trace, setTrace] = useState<TracePoint[]>([]);
  const [walkMsg, setWalkMsg] = useState<string | null>(null);
  const walker = useRef<{ stop: () => void } | null>(null);
  useEffect(() => () => walker.current?.stop(), []);

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
  /** Dejar de caminar y dibujar a mano. */
  const drawInstead = () => {
    walker.current?.stop();
    setWalk("off");
  };
  return { walk, trace, walkMsg, beginWalk, endWalk, drawInstead };
}
