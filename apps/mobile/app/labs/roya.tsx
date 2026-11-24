import { router } from "expo-router";
import { t } from "@yvy/shared";
import { Lab, Fact } from "../../src/labs/Lab";
import { LeafIllustration } from "../../src/labs/illustrations";
import { Button, Text } from "../../src/ui/kit";
import { T } from "../../src/ui/theme";

export default function Roya() {
  return (
    <Lab
      title={t("app.labs.rustTitle")}
      intro={t("app.labs.rustIntro")}
      art={<LeafIllustration />}
      result={
        <>
          <Text style={T.display}>{t("app.labs.rustLabel")}</Text>
          <Fact label={t("app.labs.rustSeverity")} value={t("app.labs.rustSeverityValue")} />
          <Fact label={t("app.labs.confidence")} value={t("app.labs.confidenceMedium")} />
          <Fact label={t("app.labs.nextStep")} value={t("app.labs.rustNext")} />
        </>
      }
      actions={
        <>
          <Text style={[T.small, { textAlign: "center" }]}>{t("app.labs.rustAnnotateHint")}</Text>
          <Button big title={t("app.labs.rustAnnotate")} onPress={() => router.push({ pathname: "/annotate", params: { kind: "pest" } })} />
        </>
      }
    />
  );
}
