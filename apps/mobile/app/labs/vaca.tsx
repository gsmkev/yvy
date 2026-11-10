import { StyleSheet, Text, View } from "react-native";
import { t } from "@yvy/shared";
import { Lab, Fact } from "../../src/labs/Lab";
import { CowIllustration } from "../../src/labs/illustrations";
import { C, RADIUS, T } from "../../src/ui/theme";

const EXAMPLE = 3.5;

export default function Vaca() {
  return (
    <Lab
      title={t("app.labsCowTitle")}
      intro={t("app.labsCowIntro")}
      art={<CowIllustration />}
      result={
        <>
          <Text style={T.number}>
            {t("app.labsCowScoreValue")} <Text style={T.small}>{t("app.labsCowScale")}</Text>
          </Text>
          <View style={st.scale} accessibilityLabel={`${t("app.labsCowScore")} ${t("app.labsCowScoreValue")} ${t("app.labsCowScale")}`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <View key={n} style={[st.step, { backgroundColor: n <= Math.round(EXAMPLE) ? C.accion : C.linea }]} />
            ))}
          </View>
          <View style={st.legend}>
            <Text style={T.small}>{t("app.labsCowScaleLow")}</Text>
            <Text style={T.small}>{t("app.labsCowScaleHigh")}</Text>
          </View>
          <Fact label={t("app.labsConfidence")} value={t("app.labsConfidenceMedium")} />
          <Text style={[T.body, { marginTop: 16 }]}>{t("app.labsCowNext")}</Text>
        </>
      }
    />
  );
}

const st = StyleSheet.create({
  scale: { flexDirection: "row", gap: 6, marginTop: 12 },
  step: { flex: 1, height: 14, borderRadius: RADIUS / 2 },
  legend: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
});
