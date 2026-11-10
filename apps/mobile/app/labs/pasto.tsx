import { Text } from "react-native";
import { t } from "@yvy/shared";
import { Lab, Fact } from "../../src/labs/Lab";
import { PastureIllustration } from "../../src/labs/illustrations";
import { T } from "../../src/ui/theme";

export default function Pasto() {
  return (
    <Lab
      title={t("app.labsGrassTitle")}
      intro={t("app.labsGrassIntro")}
      art={<PastureIllustration />}
      result={
        <>
          <Text style={T.number}>{t("app.labsGrassCoverValue")}</Text>
          <Text style={T.small}>{t("app.labsGrassCover")}</Text>
          <Fact label={t("app.labsGrassHeight")} value={t("app.labsGrassHeightValue")} />
          <Fact label={t("app.labsConfidence")} value={t("app.labsConfidenceMedium")} />
          <Text style={[T.body, { marginTop: 16 }]}>{t("app.labsGrassNext")}</Text>
        </>
      }
    />
  );
}
