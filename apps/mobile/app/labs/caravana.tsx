import { t } from "@yvy/shared";
import { Lab, Fact } from "../../src/labs/Lab";
import { TagLabelIllustration } from "../../src/labs/illustrations";
import { T } from "../../src/ui/theme";
import { Text } from "../../src/ui/kit";

export default function Caravana() {
  return (
    <Lab
      title={t("app.labs.tagTitle")}
      intro={t("app.labs.tagIntro")}
      art={<TagLabelIllustration />}
      result={
        <>
          <Text style={T.heading}>{t("app.labs.tagEarTitle")}</Text>
          <Fact label={t("app.labs.tagEarNumber")} value={t("app.labs.tagEarNumberValue")} />
          <Text style={[T.heading, { marginTop: 24 }]}>{t("app.labs.tagProductTitle")}</Text>
          <Fact label={t("app.labs.tagProductName")} value={t("app.labs.tagProductNameValue")} />
          <Fact label={t("app.labs.tagProductActive")} value={t("app.labs.tagProductActiveValue")} />
          <Fact label={t("app.labs.tagProductBatch")} value={t("app.labs.tagProductBatchValue")} />
          <Fact label={t("app.labs.confidence")} value={t("app.labs.confidenceHigh")} />
          <Text style={[T.body, { marginTop: 16 }]}>{t("app.labs.tagNext")}</Text>
        </>
      }
    />
  );
}
