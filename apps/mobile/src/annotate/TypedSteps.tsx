/** Pasos de anotación por tipo de respuesta: sí/no, número y texto. */
import { useEffect, useRef, useState, type ElementRef } from "react";
import { View, type TextInput as TextInputRef } from "react-native";
import { deltaT, sprayWarningTexts, t } from "@yvy/shared";
import type { Step } from "../lib/annotate";
import { Button, ScreenBody, Text, TextInput } from "../ui/kit";
import { C, T } from "../ui/theme";
import { tr } from "./common";
import { st } from "./styles";

type OfKind<K extends Step["kind"]> = Extract<Step, { kind: K }>;

/** Paso con respuesta sí o no. */
export function YesNoStep({ step, onAnswer }: { step: OfKind<"yesno">; onAnswer: (v: unknown) => void }) {
  return (
    <ScreenBody
      footer={
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Button big kind="secondary" title={t("app.common.no")} onPress={() => onAnswer(false)} style={{ flex: 1 }} />
          <Button big title={t("app.common.yes")} onPress={() => onAnswer(true)} style={{ flex: 1 }} />
        </View>
      }
    >
      <Text style={T.title}>{tr(step.question)}</Text>
    </ScreenBody>
  );
}

/** Número con teclado; avisa al pasar los umbrales de viento o Delta T. */
export function NumberStep({ step, value, answers, prefilled, onAnswer }: { step: OfKind<"number">; value: unknown; answers: Record<string, unknown>; prefilled: boolean; onAnswer: (v: unknown) => void }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const input = useRef<ElementRef<typeof TextInputRef>>(null);
  useEffect(() => {
    const id = setTimeout(() => input.current?.focus(), 350);
    return () => clearTimeout(id);
  }, []);
  const n = Number(text.replace(",", "."));
  const ok = text !== "" && Number.isFinite(n) && n >= (step.min ?? 0) && n <= step.max && (!step.integer || Number.isInteger(n));
  // Aviso al pasar los umbrales de viento o Delta T (con la temperatura ya cargada y esta humedad).
  const warnings =
    !ok || answers === undefined
      ? []
      : step.key === "windKmh"
        ? sprayWarningTexts({ windKmh: n })
        : step.key === "humidityPct" && typeof answers.tempC === "number"
          ? sprayWarningTexts({ deltaT: deltaT(answers.tempC, n) })
          : [];
  return (
    <ScreenBody
      footer={
        step.optional && text === "" ? (
          <Button big kind="secondary" title={t("app.common.skip")} onPress={() => onAnswer(undefined)} />
        ) : (
          <Button big title={t("app.common.next")} disabled={!ok} onPress={() => onAnswer(n)} />
        )
      }
    >
      <Text style={T.title}>{tr(step.question)}</Text>
      {step.hint && <Text style={[T.small, { marginTop: 6 }]}>{tr(step.hint)}</Text>}
      {prefilled && <Text style={[T.small, { marginTop: 6 }]}>{t("ui.spray.prefilled")}</Text>}
      <View style={st.numberRow}>
        <TextInput
          ref={input}
          value={text}
          onChangeText={(v) => setText(v.replace(/[^0-9.,]/g, "").slice(0, 6))}
          keyboardType={step.integer ? "number-pad" : "decimal-pad"}
          style={st.numberInput}
          placeholder="0"
          placeholderTextColor={C.tinta3}
          accessibilityLabel={tr(step.question)}
          onSubmitEditing={() => ok && onAnswer(n)}
        />
        <Text style={st.unit}>{step.unit}</Text>
      </View>
      {warnings.map((w) => (
        <Text key={w} style={st.warn} accessibilityRole="alert">
          {w}
        </Text>
      ))}
    </ScreenBody>
  );
}

/** Paso de respuesta con texto libre. */
export function TextStep({ step, value, onAnswer }: { step: OfKind<"text">; value: unknown; onAnswer: (v: unknown) => void }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const input = useRef<ElementRef<typeof TextInputRef>>(null);
  useEffect(() => {
    const id = setTimeout(() => input.current?.focus(), 350);
    return () => clearTimeout(id);
  }, []);
  return (
    <ScreenBody
      footer={
        step.optional && !text.trim() ? (
          <Button big kind="secondary" title={t("app.common.skip")} onPress={() => onAnswer(undefined)} />
        ) : (
          <Button big title={t("app.common.next")} disabled={!text.trim() || (!!step.pattern && !step.pattern.test(text.trim()))} onPress={() => onAnswer(text.trim())} />
        )
      }
    >
      <Text style={T.title}>{tr(step.question)}</Text>
      <TextInput
        ref={input}
        value={text}
        onChangeText={setText}
        multiline={!step.pattern}
        autoCapitalize={step.pattern ? "characters" : undefined}
        style={st.textInput}
        accessibilityLabel={tr(step.question)}
        placeholder={step.optional ? t("app.common.optional") : undefined}
        placeholderTextColor={C.tinta3}
      />
    </ScreenBody>
  );
}
