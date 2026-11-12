/**
 * Llevame ahí (F-03): una flecha grande que apunta al destino y la distancia, en vivo y sin internet.
 * Usa el GPS y la brújula del celular; el rumbo se calcula acá (src/lib/bearing.ts).
 */
import { useEffect, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import * as Location from "expo-location";
import { ArrowUp } from "lucide-react-native";
import { t } from "@yvy/shared";
import { bearingDeg, cardinal, distanceM, formatDistance, turnDeg } from "../src/lib/bearing";
import { hasAccuracy, type Fix } from "../src/lib/location";
import { s as k, Text } from "../src/ui/kit";
import { C, GUTTER, T } from "../src/ui/theme";
import { gpsHintText, useGpsStage } from "../src/lib/gpsHint";

const ARRIVED_M = 15;

export default function GoTo() {
  const params = useLocalSearchParams<{ lon: string; lat: string; name?: string }>();
  const target = { lon: Number(params.lon), lat: Number(params.lat) };
  const [me, setMe] = useState<Fix | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [denied, setDenied] = useState(false);
  const stage = useGpsStage(!me && !denied);

  useEffect(() => {
    let alive = true;
    const subs: { remove: () => void }[] = [];
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!alive) return;
      if (perm.status !== "granted") return setDenied(true);
      const pos = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 1 }, (p) =>
        setMe({ lon: p.coords.longitude, lat: p.coords.latitude, accuracy: hasAccuracy(p.coords.accuracy) ? p.coords.accuracy : null }),
      );
      const head = await Location.watchHeadingAsync((h) => setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading >= 0 ? h.magHeading : null)).catch(() => null);
      if (!alive) {
        pos.remove();
        head?.remove();
        return;
      }
      subs.push(pos);
      if (head) subs.push(head);
    })().catch(() => setDenied(true));
    return () => {
      alive = false;
      subs.forEach((s) => s.remove());
    };
  }, []);

  const dist = me ? distanceM(me, target) : null;
  const bearing = me ? bearingDeg(me, target) : null;
  const arrived = dist !== null && dist <= ARRIVED_M;
  // Con brújula la flecha gira respecto del celular; sin ella apunta con el norte arriba.
  const rotation = bearing === null ? 0 : heading === null ? bearing : turnDeg(bearing, heading);

  return (
    <View style={[k.screen, { paddingHorizontal: GUTTER, paddingTop: 12 }]}>
      <Stack.Screen options={{ title: "" }} />
      <Text style={T.small}>{t("app.gotoTo")}</Text>
      <Text style={[T.title, { marginTop: 2 }]}>{params.name || t("app.gotoThere")}</Text>
      <View style={st.center}>
        {denied ? (
          <Text style={T.body}>{t("app.gotoDenied")}</Text>
        ) : dist === null ? (
          <>
            <Text style={T.heading}>{t("app.gpsSearching")}</Text>
            <Text style={[T.small, { marginTop: 6, textAlign: "center" }]}>{gpsHintText(stage) ?? t("app.gpsSlowHint")}</Text>
          </>
        ) : arrived ? (
          <Text style={T.display}>{t("app.gotoArrived")}</Text>
        ) : (
          <>
            <View style={{ transform: [{ rotate: `${rotation}deg` }] }} accessibilityLabel={t("app.gotoArrowLabel", { dir: cardinal(bearing!) })}>
              <ArrowUp size={200} color={C.accion} strokeWidth={2.2} />
            </View>
            <Text style={[T.number, { marginTop: 24 }]}>{formatDistance(dist)}</Text>
            <Text style={[T.body, { marginTop: 4, color: C.tinta2 }]}>{t("app.gotoBearing", { dir: cardinal(bearing!), deg: Math.round(bearing!) })}</Text>
            {heading === null && <Text style={[T.small, { marginTop: 12, textAlign: "center" }]}>{t("app.gotoNoCompass")}</Text>}
          </>
        )}
      </View>
      {me?.accuracy ? <Text style={[T.small, { textAlign: "center", marginBottom: 24 }]}>{t("app.gpsOk", { m: Math.round(me.accuracy) })}</Text> : null}
      <Text style={[T.small, { textAlign: "center", marginBottom: 24 }]}>{t("app.gotoOffline")}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
