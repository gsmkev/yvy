import { useState } from "react";
import { View } from "react-native";
import { t, type ProductDose } from "@yvy/shared";
import { Button, ScreenBody, Text, TextInput } from "../ui/kit";
import { C, T } from "../ui/theme";
import { tr } from "./common";
import { st } from "./styles";

/**
 * Cierre de la orden (E-21): lo que realmente salió del depósito, por producto. Si no se escribe, queda lo previsto
 * (dosis por superficie hecha) y no se guarda cantidad.
 */
export function UsageStep({ question, hint, products, areaHa, onAnswer }: { question: string; hint?: string; products: ProductDose[]; areaHa: number | null; onAnswer: (v: unknown) => void }) {
  const [texts, setTexts] = useState<string[]>(() => products.map((p) => (p.usedQty ? String(p.usedQty).replace(".", ",") : "")));
  const parse = (x: string) => Number(x.replace(",", "."));
  const valid = (x: string) => x === "" || (Number.isFinite(parse(x)) && parse(x) > 0 && parse(x) <= 1_000_000_000);
  const planned = (p: ProductDose) => (areaHa ? Math.round(p.dose * areaHa * 100) / 100 : null);
  const done = () => onAnswer(products.map((p, i) => ({ ...p, usedQty: texts[i] ? parse(texts[i]!) : undefined })));
  const anyText = texts.some((x) => x !== "");
  return (
    <ScreenBody footer={<Button big title={anyText ? t("app.common.next") : t("app.usage.asPlanned")} disabled={!texts.every(valid)} onPress={done} />}>
      <Text style={T.title}>{tr(question)}</Text>
      {hint && <Text style={[T.small, { marginTop: 6, marginBottom: 16 }]}>{tr(hint)}</Text>}
      {products.map((p, i) => {
        const unit = tr(`fields.usage.unit_${p.unit}`);
        const plan = planned(p);
        return (
          <View key={p.productId ?? p.name} style={{ marginBottom: 20 }}>
            <Text style={T.body}>{p.name}</Text>
            {plan !== null && <Text style={T.small}>{t("app.usage.planned", { qty: `${String(plan).replace(".", ",")} ${unit}` })}</Text>}
            <View style={st.numberRow}>
              <TextInput
                value={texts[i]}
                onChangeText={(v) => setTexts((xs) => xs.map((x, j) => (j === i ? v.replace(/[^0-9.,]/g, "").slice(0, 10) : x)))}
                keyboardType="decimal-pad"
                style={st.numberInput}
                placeholder={plan !== null ? String(plan).replace(".", ",") : "0"}
                placeholderTextColor={C.tinta3}
                accessibilityLabel={`${p.name} (${unit})`}
              />
              <Text style={st.unit}>{unit}</Text>
            </View>
          </View>
        );
      })}
    </ScreenBody>
  );
}
