import { router } from "expo-router";
import { t } from "@yvy/shared";
import { Lab, Fact } from "../../src/labs/Lab";
import { LeafIllustration } from "../../src/labs/illustrations";
import { Button, Text } from "../../src/ui/kit";
import { T } from "../../src/ui/theme";

export default function Roya() {
  return (
    <Lab
      title={t("app.labsRustTitle")}
      intro={t("app.labsRustIntro")}
      art={<LeafIllustration />}
      result={
        <>
          <Text style={T.display}>{t("app.labsRustLabel")}</Text>
          <Fact label={t("app.labsRustSeverity")} value={t("app.labsRustSeverityValue")} />
          <Fact label={t("app.labsConfidence")} value={t("app.labsConfidenceMedium")} />
          <Fact label={t("app.labsNextStep")} value={t("app.labsRustNext")} />
        </>
      }
      actions={
        <>
          <Text style={[T.small, { textAlign: "center" }]}>{t("app.labsRustAnnotateHint")}</Text>
          <Button big title={t("app.labsRustAnnotate")} onPress={() => router.push({ pathname: "/annotate", params: { kind: "pest" } })} />
        </>
      }
    />
  );
}
