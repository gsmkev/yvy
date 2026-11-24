import { t } from "@yvy/shared";
import { Lab, Fact } from "../../src/labs/Lab";
import { BeatClothIllustration } from "../../src/labs/illustrations";
import { T } from "../../src/ui/theme";
import { Text } from "../../src/ui/kit";

export default function Chinches() {
  return (
    <Lab
      title={t("app.labs.bugsTitle")}
      intro={t("app.labs.bugsIntro")}
      art={<BeatClothIllustration />}
      result={
        <>
          <Text style={T.display}>{t("app.labs.bugsTotal")}</Text>
          <Fact label={t("app.labs.bugsSpeciesNezara")} value="4" />
          <Fact label={t("app.labs.bugsSpeciesPiezodorus")} value="2" />
          <Fact label={t("app.labs.bugsSpeciesEdessa")} value="1" />
          <Fact label={t("app.labs.bugsPerMeterLabel")} value={t("app.labs.bugsPerMeter", { n: "3,5" })} />
          <Text style={[T.body, { marginTop: 16 }]}>{t("app.labs.bugsThreshold")}</Text>
          <Text style={[T.small, { marginTop: 8 }]}>{t("app.labs.bugsNext")}</Text>
        </>
      }
    />
  );
}
