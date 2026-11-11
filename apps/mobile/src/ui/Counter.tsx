/**
 * Contador rápido de hacienda (G-06): una fila por categoría con − y + grandes, para contar en la manga con
 * guantes y sin señal. Mantener apretado repite; el número también se puede tipear. Todo es local.
 */
import { useEffect, useRef } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { HERD_CATEGORIES, t, type HerdCategory, type HerdCounts } from "@yvy/shared";
import { allZero, bump, canContinue, counterTotal, setTyped } from "../lib/counter";
import { Button, Text, TextInput } from "./kit";
import { C, F, GUTTER, RADIUS, T } from "./theme";

const BTN = 64;

function StepButton({ sign, label, onBump }: { sign: "−" | "+"; label: string; onBump: (delta: number) => void }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const delta = sign === "+" ? 1 : -1;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onBump(delta)}
      onLongPress={() => {
        // Mantener apretado: sube de a 1 y, después de un rato, de a 5.
        let ticks = 0;
        timer.current = setInterval(() => onBump(delta * (++ticks > 15 ? 5 : 1)), 90);
      }}
      delayLongPress={350}
      onPressOut={stop}
      style={({ pressed }) => [st.btn, sign === "+" ? st.btnPlus : st.btnMinus, pressed && { opacity: 0.8 }]}
    >
      <Text style={[st.btnText, { color: sign === "+" ? C.blanco : C.tinta }]}>{sign}</Text>
    </Pressable>
  );
}

export function HerdCounter({
  question,
  hint,
  counts,
  onChange,
  onDone,
}: {
  question: string;
  hint?: string;
  counts: HerdCounts;
  onChange: (c: HerdCounts) => void;
  onDone: (c: HerdCounts) => void;
}) {
  // Las pulsaciones repetidas llegan antes de que React vuelva a renderizar: se acumulan sobre el último valor.
  const latest = useRef(counts);
  latest.current = counts;
  const apply = (next: HerdCounts) => {
    latest.current = next;
    onChange(next);
  };
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: GUTTER, paddingTop: 12 }}>
        <Text style={T.title}>{question}</Text>
        {hint ? <Text style={[T.small, { marginTop: 6 }]}>{hint}</Text> : null}
      </View>
      <View style={{ paddingHorizontal: GUTTER, marginTop: 8 }}>
        {HERD_CATEGORIES.map((cat: HerdCategory) => (
          <View key={cat} style={st.row}>
            <Text style={[T.heading, { flex: 1 }]}>{t(`fields.herd_${cat}`)}</Text>
            <StepButton sign="−" label={`${t(`fields.herd_${cat}`)}: −1`} onBump={(d) => apply(bump(latest.current, cat, d))} />
            <TextInput
              value={counts[cat] === undefined ? "" : String(counts[cat])}
              onChangeText={(v) => apply(setTyped(latest.current, cat, v))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={C.tinta3}
              selectTextOnFocus
              accessibilityLabel={t(`fields.herd_${cat}`)}
              style={st.value}
            />
            <StepButton sign="+" label={`${t(`fields.herd_${cat}`)}: +1`} onBump={(d) => apply(bump(latest.current, cat, d))} />
          </View>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ paddingHorizontal: GUTTER, paddingBottom: 24 }}>
        <Text style={[T.heading, { textAlign: "center", marginBottom: 12 }]}>
          {t("app.herdCounterTotal", { n: counterTotal(counts) })}
        </Text>
        <Button big title={t("app.next")} disabled={!canContinue(counts)} onPress={() => onDone(counts)} />
        <Button kind="text" title={t("app.herdEmpty")} onPress={() => onDone(allZero())} style={{ marginTop: 4 }} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: BTN + 16, borderBottomWidth: 1, borderBottomColor: C.linea },
  btn: { width: BTN, height: BTN, borderRadius: RADIUS, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  btnPlus: { backgroundColor: C.accion, borderColor: C.accion },
  btnMinus: { backgroundColor: C.blanco, borderColor: C.lineaFuerte },
  btnText: { fontFamily: F.sansSemi, fontSize: 32, lineHeight: 36 },
  value: {
    ...T.heading,
    fontFamily: F.serif,
    fontSize: 30,
    lineHeight: 34,
    width: 84,
    textAlign: "center",
    padding: 0,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}),
  },
});
