/** Laboratorio: identificación de pasturas. */
import { t } from "@yvy/shared";
import { Lab, Fact } from "../../src/labs/Lab";
import { PastureIllustration } from "../../src/labs/illustrations";
import { T } from "../../src/ui/theme";
import { Text } from "../../src/ui/kit";

/** Pantalla del laboratorio de pasturas. */
export default function Pasto() {
  return (
    <Lab
      title={t("app.labs.grassTitle")}
      intro={t("app.labs.grassIntro")}
      art={<PastureIllustration />}
      result={
        <>
          <Text style={T.number}>{t("app.labs.grassCoverValue")}</Text>
          <Text style={T.small}>{t("app.labs.grassCover")}</Text>
          <Fact label={t("app.labs.grassHeight")} value={t("app.labs.grassHeightValue")} />
          <Fact label={t("app.labs.confidence")} value={t("app.labs.confidenceMedium")} />
          <Text style={[T.body, { marginTop: 16 }]}>{t("app.labs.grassNext")}</Text>
        </>
      }
    />
  );
}
