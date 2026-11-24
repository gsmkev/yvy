/** Laboratorio: identificación de malezas. */
import { t } from "@yvy/shared";
import { Lab, Fact } from "../../src/labs/Lab";
import { WeedIllustration } from "../../src/labs/illustrations";
import { T } from "../../src/ui/theme";
import { Text } from "../../src/ui/kit";

/** Pantalla del laboratorio de malezas. */
export default function Malezas() {
  return (
    <Lab
      title={t("app.labs.weedIdTitle")}
      intro={t("app.labs.weedIdIntro")}
      art={<WeedIllustration />}
      result={
        <>
          <Text style={T.display}>{t("app.labs.weedIdName")}</Text>
          <Text style={[T.small, { marginTop: 4 }]}>{t("app.labs.weedIdScientific")}</Text>
          <Fact label={t("app.labs.confidence")} value={t("app.labs.confidenceMedium")} />
          <Fact label={t("app.labs.weedIdOthers")} value={t("app.labs.weedIdOthersValue")} />
          <Fact label={t("app.labs.weedIdStage")} value={t("app.labs.weedIdStageValue")} />
          <Fact label={t("app.labs.weedIdControl")} value={t("app.labs.weedIdControlValue")} />
          <Text style={[T.body, { marginTop: 16 }]}>{t("app.labs.weedIdNext")}</Text>
        </>
      }
    />
  );
}
