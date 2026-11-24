import { View } from "react-native";
import { router, Stack } from "expo-router";
import { Check } from "lucide-react-native";
import { describeRecord, t, type RecordKind } from "@yvy/shared";
import type { Plot } from "../db/store";
import { getDb } from "../lib/db";
import { useSyncStatus } from "../lib/sync";
import { Button, ScreenBody, s as k, Text } from "../ui/kit";
import { C, T } from "../ui/theme";
import { st } from "./styles";

export function Done({ plot, kind, values }: { plot: Plot | null; kind: RecordKind; values: Record<string, unknown> }) {
  const st2 = useSyncStatus();
  const db = getDb();
  const rain = plot ? db.rainThisMonth(plot.farmId) : 0;
  const offline = !st2.online || st2.pending > 0;
  return (
    <View style={k.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenBody
        footer={
          <>
            <Button big title={t("app.annotate.again")} onPress={() => router.replace({ pathname: "/annotate", params: plot ? { plotId: plot.id } : {} })} />
            <Button kind="secondary" title={t("app.common.backToToday")} onPress={() => router.replace("/(tabs)")} />
          </>
        }
      >
        <View style={{ marginTop: 72 }}>
          <View style={st.doneMark}>
            <Check size={36} color={C.blanco} strokeWidth={3} />
          </View>
          <Text style={[T.title, { marginTop: 24 }]}>{plot ? t("app.saved.title", { plot: plot.name }) : t(`record-kinds.kind.${kind}`)}</Text>
          <Text style={[T.body, { marginTop: 8 }]}>{describeRecord(kind, values)}</Text>
          {kind === "rain" && rain > 0 && <Text style={[T.heading, { marginTop: 20, color: C.accionOscuro }]}>{t("app.rain.month", { mm: Math.round(rain) })}</Text>}
          <Text style={[T.small, { marginTop: 20 }]}>{offline ? t("app.saved.offline") : t("app.saved.online")}</Text>
        </View>
      </ScreenBody>
    </View>
  );
}
