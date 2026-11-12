import { useEffect, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { t } from "@yvy/shared";
import { formatDistance } from "../lib/bearing";
import { useWalk } from "../lib/walk";
import { durationS, formatDuration } from "../lib/walkTracker";
import { Text } from "./kit";
import { C, GUTTER, T } from "./theme";

/** Barra siempre visible mientras se graba una recorrida (F-05): nunca se graba a escondidas. Tocarla abre la pantalla. */
export function WalkBanner() {
  const { recording, draft } = useWalk();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);
  if (!recording || !draft) return null;
  const text = t("app.walkRecordingBanner", { dist: formatDistance(draft.distanceM), time: formatDuration(durationS(draft, Date.now())) });
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={text} onPress={() => router.push("/walk")} style={s.bar}>
      <Text style={[T.smallMedium, { color: C.blanco }]}>{text}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: { minHeight: 44, justifyContent: "center", paddingHorizontal: GUTTER, backgroundColor: C.peligro },
});
