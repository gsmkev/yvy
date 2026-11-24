/** Pantalla para elegir varios lotes a la vez. */
import { ScrollView, View } from "react-native";
import { Check } from "lucide-react-native";
import { t } from "@yvy/shared";
import type { Plot } from "../db/store";
import { Button, Row, s as k, Text } from "../ui/kit";
import { C, T } from "../ui/theme";
import { AnnotateHeader } from "./Header";
import { plotSubtitle } from "./common";
import { st } from "./styles";
import type { AnnotateState } from "./useAnnotate";

/** 1b. Varios lotes: se marcan los que reciben el mismo registro. */
export function MultiScreen({ a }: { a: AnnotateState }) {
  const { plots, multi, setMulti, setPlot, setPhase, kind, entryFor } = a;
  const toggle = (p: Plot) => setMulti((m) => (m.some((x) => x.id === p.id) ? m.filter((x) => x.id !== p.id) : [...m, p]));
  return (
    <View style={k.screen}>
      <AnnotateHeader a={a} />
      <ScrollView contentContainerStyle={k.pad}>
        <Text style={T.title}>{t("app.several.plotsTitle")}</Text>
        <Text style={[T.small, { marginTop: 6, marginBottom: 16 }]}>{t("app.several.plotsHint")}</Text>
        {plots.map((p) => {
          const on = multi.some((x) => x.id === p.id);
          return (
            <Row
              key={p.id}
              title={p.name}
              subtitle={plotSubtitle(p)}
              choice="checkbox"
              selected={on}
              onPress={() => toggle(p)}
              left={on ? <Check size={22} color={C.accion} strokeWidth={3} /> : <View style={st.box} />}
            />
          );
        })}
        <Button
          big
          disabled={multi.length === 0}
          title={multi.length === 1 ? t("app.several.plotsContinueOne") : t("app.several.plotsContinue", { n: multi.length })}
          onPress={() => {
            // Un solo lote marcado es un lote común.
            setPlot(multi.length === 1 ? multi[0]! : null);
            setPhase(kind ? entryFor(kind) : { name: "kind" });
          }}
          style={{ marginTop: 20 }}
        />
      </ScrollView>
    </View>
  );
}
