import { useEffect, useRef, useState, type RefObject } from "react";
import type { CameraRef } from "@maplibre/maplibre-react-native";
import { mapBearingFor, shouldRotate } from "../lib/heading";
import { useHeading } from "../lib/useHeading";

/** F-04: brújula y mapa que gira con el rumbo (se activa a mano; el sensor solo corre mientras está activo). */
export function useMapCompass(camera: RefObject<CameraRef | null>) {
  const [follow, setFollow] = useState(false);
  const [bearing, setBearing] = useState(0);
  const bearingRef = useRef(0);
  const heading = useHeading(follow);
  useEffect(() => {
    if (!follow || heading === null) return;
    const target = mapBearingFor(heading);
    if (!shouldRotate(bearingRef.current, target)) return;
    bearingRef.current = target;
    camera.current?.setStop({ bearing: target, duration: 250, easing: "linear" });
  }, [follow, heading]);
  const northUp = () => {
    setFollow(false);
    bearingRef.current = 0;
    camera.current?.setStop({ bearing: 0, duration: 300, easing: "ease" });
  };
  /** El mapa avisa su rumbo mientras se gira a mano. */
  const onBearing = (raw: number) => {
    const b = Math.round(raw);
    bearingRef.current = b;
    setBearing((prev) => (prev === b ? prev : b));
  };
  return { follow, setFollow, bearing, northUp, onBearing };
}
