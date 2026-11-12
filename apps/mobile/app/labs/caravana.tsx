import { t } from "@yvy/shared";
import { Lab, Fact } from "../../src/labs/Lab";
import { TagLabelIllustration } from "../../src/labs/illustrations";
import { T } from "../../src/ui/theme";
import { Text } from "../../src/ui/kit";

export default function Caravana() {
  return (
    <Lab
      title={t("app.labsTagTitle")}
      intro={t("app.labsTagIntro")}
      art={<TagLabelIllustration />}
      result={
        <>
          <Text style={T.heading}>{t("app.labsTagEarTitle")}</Text>
          <Fact label={t("app.labsTagEarNumber")} value={t("app.labsTagEarNumberValue")} />
          <Text style={[T.heading, { marginTop: 24 }]}>{t("app.labsTagProductTitle")}</Text>
          <Fact label={t("app.labsTagProductName")} value={t("app.labsTagProductNameValue")} />
          <Fact label={t("app.labsTagProductActive")} value={t("app.labsTagProductActiveValue")} />
          <Fact label={t("app.labsTagProductBatch")} value={t("app.labsTagProductBatchValue")} />
          <Fact label={t("app.labsConfidence")} value={t("app.labsConfidenceHigh")} />
          <Text style={[T.body, { marginTop: 16 }]}>{t("app.labsTagNext")}</Text>
        </>
      }
    />
  );
}
