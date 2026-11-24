/** Formulario de nombre, tipo y cultivo del lote dibujado. */
import { ScrollView } from "react-native";
import { Stack } from "expo-router";
import { CROPS, PLOT_KINDS, t, type MessageKey } from "@yvy/shared";
import type { checkDraft } from "../lib/plotDraft";
import { Button, RadioGroup, Row, s as k, Text, TextInput } from "../ui/kit";
import { C, T } from "../ui/theme";
import { st } from "./styles";

type Draft = ReturnType<typeof checkDraft>;
type Kind = (typeof PLOT_KINDS)[number];
type Crop = (typeof CROPS)[number];

/** Segundo paso: nombre, tipo y cultivo del lote dibujado. */
export function PlotForm({ draft, name, setName, kind, setKind, crop, setCrop, onSave, onBack }: {
  draft: Draft;
  name: string;
  setName: (v: string) => void;
  kind: Kind;
  setKind: (k: Kind) => void;
  crop: Crop | null;
  setCrop: (c: Crop) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  return (
    <ScrollView style={k.screen} contentContainerStyle={k.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "" }} />
      <Text style={T.title}>{t("app.plot.drawData")}</Text>
      {"ha" in draft && (
        <Text style={[T.small, { marginTop: 6 }]}>
          {t("ui.common.ha", { value: draft.ha.toLocaleString("es-PY", { maximumFractionDigits: 1 }) })}
        </Text>
      )}
      <Text style={[T.heading, { marginTop: 24, marginBottom: 8 }]}>{t("app.plot.drawName")}</Text>
      <TextInput
        value={name}
        onChangeText={(v) => setName(v.slice(0, 120))}
        placeholder={t("app.plot.drawNamePlaceholder")}
        placeholderTextColor={C.tinta3}
        accessibilityLabel={t("app.plot.drawName")}
        style={st.input}
      />
      <Text style={[T.heading, { marginTop: 24, marginBottom: 4 }]}>{t("app.plot.drawKind")}</Text>
      <RadioGroup label={t("app.plot.drawKind")}>
        {PLOT_KINDS.map((kd) => (
          <Row key={kd} choice="radio" title={kd === "crop" ? t("ui.common.crop") : t("ui.common.pasture")} selected={kind === kd} onPress={() => setKind(kd)} />
        ))}
      </RadioGroup>
      {kind === "crop" && (
        <>
          <Text style={[T.heading, { marginTop: 24, marginBottom: 4 }]}>{t("app.plot.drawCrop")}</Text>
          <RadioGroup label={t("app.plot.drawCrop")}>
            {CROPS.map((c) => (
              <Row key={c} choice="radio" title={t(`fields.crop.${c}` as MessageKey)} selected={crop === c} onPress={() => setCrop(c)} />
            ))}
          </RadioGroup>
        </>
      )}
      <Button big title={t("app.plot.drawSave")} disabled={!name.trim() || !("polygon" in draft)} onPress={onSave} style={{ marginTop: 28 }} />
      <Button kind="text" title={t("app.plot.drawBack")} onPress={onBack} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}
