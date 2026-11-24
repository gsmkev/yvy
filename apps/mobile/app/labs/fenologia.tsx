import { StyleSheet, View } from "react-native";
import { t } from "@yvy/shared";
import { Lab, Fact } from "../../src/labs/Lab";
import { SoyStageIllustration } from "../../src/labs/illustrations";
import { C, RADIUS, T } from "../../src/ui/theme";
import { Text } from "../../src/ui/kit";

const STAGES = ["VE", "V3", "V6", "R1", "R2", "R3", "R5", "R7"];
const EXAMPLE = "R2";

export default function Fenologia() {
  return (
    <Lab
      title={t("app.labs.stageTitle")}
      intro={t("app.labs.stageIntro")}
      art={<SoyStageIllustration />}
      result={
        <>
          <Text style={T.display}>{t("app.labs.stageValue")}</Text>
          <Fact label={t("app.labs.stageCrop")} value={t("app.labs.stageCropValue")} />
          <Text style={[T.small, { marginTop: 16 }]}>{t("app.labs.stageScale")}</Text>
          <View style={st.scale} accessibilityLabel={`${t("app.labs.stageScale")}: ${t("app.labs.stageValue")}`}>
            {STAGES.map((s) => (
              <View key={s} style={[st.step, { backgroundColor: s === EXAMPLE ? C.accion : C.linea }]}>
                <Text style={[T.small, { color: s === EXAMPLE ? C.lino : C.tinta2 }]}>{s}</Text>
              </View>
            ))}
          </View>
          <Fact label={t("app.labs.confidence")} value={t("app.labs.confidenceMedium")} />
          <Text style={[T.body, { marginTop: 16 }]}>{t("app.labs.stageNext")}</Text>
        </>
      }
    />
  );
}

const st = StyleSheet.create({
  scale: { flexDirection: "row", gap: 4, marginTop: 8 },
  step: { flex: 1, height: 34, borderRadius: RADIUS / 2, alignItems: "center", justifyContent: "center" },
});
