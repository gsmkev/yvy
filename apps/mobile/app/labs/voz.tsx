/** Laboratorio: notas de voz. */
import { StyleSheet, View } from "react-native";
import { t } from "@yvy/shared";
import { Lab, Fact } from "../../src/labs/Lab";
import { C, T } from "../../src/ui/theme";
import { Text } from "../../src/ui/kit";

/** Pantalla del laboratorio de voz. */
export default function Voz() {
  return (
    <Lab
      title={t("app.labs.voiceTitle")}
      intro={t("app.labs.voiceIntro")}
      result={
        <>
          <Text style={[T.small, { marginTop: 8 }]}>{t("app.labs.voiceHeard")}</Text>
          <View style={st.quote}>
            <Text style={T.body}>{t("app.labs.voiceTranscript")}</Text>
          </View>
          <Text style={[T.heading, { marginTop: 24 }]}>{t("app.labs.voiceBecomes")}</Text>
          <Fact label={t("app.labs.voiceField1")} value={t("app.labs.voiceValue1")} />
          <Fact label={t("app.labs.voiceField2")} value={t("app.labs.voiceValue2")} />
          <Fact label={t("app.labs.voiceField3")} value={t("app.labs.voiceValue3")} />
          <Text style={[T.body, { marginTop: 16 }]}>{t("app.labs.voiceNext")}</Text>
        </>
      }
    />
  );
}

const st = StyleSheet.create({
  quote: { borderLeftWidth: 3, borderLeftColor: C.lineaFuerte, paddingLeft: 14, marginTop: 8 },
});
