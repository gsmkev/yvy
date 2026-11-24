/** Pantalla de elección del tipo de registro. */
import { ScrollView, View } from "react-native";
import { t } from "@yvy/shared";
import { KINDS_FOR, SINGLE_PLOT_KINDS } from "../lib/annotate";
import { Row, s as k, Text } from "../ui/kit";
import { T } from "../ui/theme";
import { AnnotateHeader } from "./Header";
import type { AnnotateState } from "./useAnnotate";

/** 2. Qué pasó: los tipos de registro que aplican al lote. */
export function KindScreen({ a }: { a: AnnotateState }) {
  const { db, plot, multi, setKind, setValues, seed, setStationMode, setPhase, entryFor } = a;
  const rain = plot ? db.rainThisMonth(plot.farmId) : 0;
  return (
    <View style={k.screen}>
      <AnnotateHeader a={a} />
      <ScrollView contentContainerStyle={k.pad}>
        <Text style={T.title}>{t("app.common.whatHappened")}</Text>
        {plot && rain > 0 && <Text style={[T.small, { marginTop: 6 }]}>{t("app.rain.month", { mm: Math.round(rain) })}</Text>}
        <View style={{ height: 16 }} />
        {KINDS_FOR(plot?.kind ?? (multi.length > 1 && multi.every((p) => p.kind === multi[0]!.kind) ? multi[0]!.kind : null))
          .filter((kd) => !(multi.length > 1 && SINGLE_PLOT_KINDS.includes(kd)))
          .map((kd) => (
          <Row
            key={kd}
            title={t(`record-kinds.kind.${kd}`)}
            onPress={() => {
              setKind(kd);
              setValues(seed(kd));
              setStationMode(false);
              setPhase(entryFor(kd));
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}
