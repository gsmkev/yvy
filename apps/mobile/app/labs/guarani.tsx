import { StyleSheet, View } from "react-native";
import { t } from "@yvy/shared";
import { Lab } from "../../src/labs/Lab";
import { C, T } from "../../src/ui/theme";
import { Text } from "../../src/ui/kit";

export default function Guarani() {
  return (
    <Lab
      title={t("app.labsTranslateTitle")}
      intro={t("app.labsTranslateIntro")}
      result={
        <>
          <Text style={[T.small, { marginTop: 8 }]}>{t("app.labsTranslateFrom")}</Text>
          <View style={st.quote}>
            <Text style={T.body}>{t("app.labsTranslateFromText")}</Text>
          </View>
          <Text style={[T.small, { marginTop: 24 }]}>{t("app.labsTranslateTo")}</Text>
          <View style={st.quote}>
            <Text style={T.body}>{t("app.labsTranslateToText")}</Text>
          </View>
          <Text style={[T.body, { marginTop: 24 }]}>{t("app.labsTranslateWarn")}</Text>
          <Text style={[T.small, { marginTop: 8 }]}>{t("app.labsTranslateNext")}</Text>
        </>
      }
    />
  );
}

const st = StyleSheet.create({
  quote: { borderLeftWidth: 3, borderLeftColor: C.lineaFuerte, paddingLeft: 14, marginTop: 8 },
});
