import { StyleSheet, View } from "react-native";
import { t } from "@yvy/shared";
import { Lab, Fact } from "../../src/labs/Lab";
import { CowIllustration } from "../../src/labs/illustrations";
import { C, RADIUS, T } from "../../src/ui/theme";
import { Text } from "../../src/ui/kit";

const EXAMPLE = 3.5;

export default function Vaca() {
  return (
    <Lab
      title={t("app.labs.cowTitle")}
      intro={t("app.labs.cowIntro")}
      art={<CowIllustration />}
      result={
        <>
          <Text style={T.number}>
            {t("app.labs.cowScoreValue")} <Text style={T.small}>{t("app.labs.cowScale")}</Text>
          </Text>
          <View style={st.scale} accessibilityLabel={`${t("app.labs.cowScore")} ${t("app.labs.cowScoreValue")} ${t("app.labs.cowScale")}`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <View key={n} style={[st.step, { backgroundColor: n <= Math.round(EXAMPLE) ? C.accion : C.linea }]} />
            ))}
          </View>
          <View style={st.legend}>
            <Text style={T.small}>{t("app.labs.cowScaleLow")}</Text>
            <Text style={T.small}>{t("app.labs.cowScaleHigh")}</Text>
          </View>
          <Fact label={t("app.labs.confidence")} value={t("app.labs.confidenceMedium")} />
          <Text style={[T.body, { marginTop: 16 }]}>{t("app.labs.cowNext")}</Text>
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
