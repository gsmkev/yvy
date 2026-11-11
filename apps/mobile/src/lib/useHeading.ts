import { useEffect, useState } from "react";
import * as Location from "expo-location";
import { smoothHeading } from "./heading";

/** Rumbo del celular en grados (0 = norte) mientras `enabled`; null sin brújula o sin permiso. Se apaga al desactivar. */
export function useHeading(enabled: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) {
      setHeading(null);
      return;
    }
    let alive = true;
    let sub: { remove: () => void } | null = null;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!alive || perm.status !== "granted") return;
      sub = await Location.watchHeadingAsync((h) => {
        const raw = h.trueHeading >= 0 ? h.trueHeading : h.magHeading >= 0 ? h.magHeading : null;
        if (raw !== null) setHeading((prev) => smoothHeading(prev, raw));
      }).catch(() => null);
      if (!alive) sub?.remove();
    })().catch(() => {});
    return () => {
      alive = false;
      sub?.remove();
    };
  }, [enabled]);
  return heading;
}
