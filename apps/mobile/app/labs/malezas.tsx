import { t } from "@yvy/shared";
import { Lab, Fact } from "../../src/labs/Lab";
import { WeedIllustration } from "../../src/labs/illustrations";
import { T } from "../../src/ui/theme";
import { Text } from "../../src/ui/kit";

export default function Malezas() {
  return (
    <Lab
      title={t("app.labsWeedIdTitle")}
      intro={t("app.labsWeedIdIntro")}
      art={<WeedIllustration />}
      result={
        <>
          <Text style={T.display}>{t("app.labsWeedIdName")}</Text>
          <Text style={[T.small, { marginTop: 4 }]}>{t("app.labsWeedIdScientific")}</Text>
          <Fact label={t("app.labsConfidence")} value={t("app.labsConfidenceMedium")} />
          <Fact label={t("app.labsWeedIdOthers")} value={t("app.labsWeedIdOthersValue")} />
          <Fact label={t("app.labsWeedIdStage")} value={t("app.labsWeedIdStageValue")} />
          <Fact label={t("app.labsWeedIdControl")} value={t("app.labsWeedIdControlValue")} />
          <Text style={[T.body, { marginTop: 16 }]}>{t("app.labsWeedIdNext")}</Text>
        </>
      }
    />
  );
}
