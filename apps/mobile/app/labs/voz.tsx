import { StyleSheet, Text, View } from "react-native";
import { t } from "@yvy/shared";
import { Lab, Fact } from "../../src/labs/Lab";
import { C, T } from "../../src/ui/theme";

export default function Voz() {
  return (
    <Lab
      title={t("app.labsVoiceTitle")}
      intro={t("app.labsVoiceIntro")}
      result={
        <>
          <Text style={[T.small, { marginTop: 8 }]}>{t("app.labsVoiceHeard")}</Text>
          <View style={st.quote}>
            <Text style={T.body}>{t("app.labsVoiceTranscript")}</Text>
          </View>
          <Text style={[T.heading, { marginTop: 24 }]}>{t("app.labsVoiceBecomes")}</Text>
          <Fact label={t("app.labsVoiceField1")} value={t("app.labsVoiceValue1")} />
          <Fact label={t("app.labsVoiceField2")} value={t("app.labsVoiceValue2")} />
          <Fact label={t("app.labsVoiceField3")} value={t("app.labsVoiceValue3")} />
          <Text style={[T.body, { marginTop: 16 }]}>{t("app.labsVoiceNext")}</Text>
        </>
      }
    />
  );
}

const st = StyleSheet.create({
  quote: { borderLeftWidth: 3, borderLeftColor: C.lineaFuerte, paddingLeft: 14, marginTop: 8 },
});
