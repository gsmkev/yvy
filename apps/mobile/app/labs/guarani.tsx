/** Laboratorio: traducción al guaraní. */
import { StyleSheet, View } from "react-native";
import { t } from "@yvy/shared";
import { Lab } from "../../src/labs/Lab";
import { C, T } from "../../src/ui/theme";
import { Text } from "../../src/ui/kit";

/** Pantalla del laboratorio de traducción. */
export default function Guarani() {
  return (
    <Lab
      title={t("app.labs.translateTitle")}
      intro={t("app.labs.translateIntro")}
      result={
        <>
          <Text style={[T.small, { marginTop: 8 }]}>{t("app.labs.translateFrom")}</Text>
          <View style={st.quote}>
            <Text style={T.body}>{t("app.labs.translateFromText")}</Text>
          </View>
          <Text style={[T.small, { marginTop: 24 }]}>{t("app.labs.translateTo")}</Text>
          <View style={st.quote}>
            <Text style={T.body}>{t("app.labs.translateToText")}</Text>
          </View>
          <Text style={[T.body, { marginTop: 24 }]}>{t("app.labs.translateWarn")}</Text>
          <Text style={[T.small, { marginTop: 8 }]}>{t("app.labs.translateNext")}</Text>
        </>
      }
    />
  );
}

const st = StyleSheet.create({
  quote: { borderLeftWidth: 3, borderLeftColor: C.lineaFuerte, paddingLeft: 14, marginTop: 8 },
});
