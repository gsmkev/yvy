import { t } from "@yvy/shared";
import { Lab, Fact } from "../../src/labs/Lab";
import { BeatClothIllustration } from "../../src/labs/illustrations";
import { T } from "../../src/ui/theme";
import { Text } from "../../src/ui/kit";

export default function Chinches() {
  return (
    <Lab
      title={t("app.labsBugsTitle")}
      intro={t("app.labsBugsIntro")}
      art={<BeatClothIllustration />}
      result={
        <>
          <Text style={T.display}>{t("app.labsBugsTotal")}</Text>
          <Fact label={t("app.labsBugsSpeciesNezara")} value="4" />
          <Fact label={t("app.labsBugsSpeciesPiezodorus")} value="2" />
          <Fact label={t("app.labsBugsSpeciesEdessa")} value="1" />
          <Fact label={t("app.labsBugsPerMeterLabel")} value={t("app.labsBugsPerMeter", { n: "3,5" })} />
          <Text style={[T.body, { marginTop: 16 }]}>{t("app.labsBugsThreshold")}</Text>
          <Text style={[T.small, { marginTop: 8 }]}>{t("app.labsBugsNext")}</Text>
        </>
      }
    />
  );
}
