/** Controles de formulario de las pantallas de oficina: campo con etiqueta y selector de una opción (filas de 48 px). */
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "./kit";
import { C, F, RADIUS, T, TOUCH } from "./theme";

export function Field({ label, hint, ...input }: { label: string; hint?: string } & ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={T.smallMedium}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={C.tinta3} {...input} style={[st.input, input.style]} />
      {hint ? <Text style={[T.small, { marginTop: 4 }]}>{hint}</Text> : null}
    </View>
  );
}

/** Opciones en fila que se pueden elegir (una sola). Cada una mide 48 px de alto como mínimo. */
export function Choice<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: { value: V; label: string }[]; onChange: (v: V) => void }) {
  return (
    <View style={{ marginTop: 16 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={T.smallMedium}>{label}</Text>
      <View style={st.choices}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ checked: on }}
              onPress={() => onChange(o.value)}
              style={[st.chip, on && st.chipOn]}
            >
              <Text style={[T.bodyMedium, { fontSize: 16 }, on && { color: C.blanco }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  input: { ...T.body, backgroundColor: C.blanco, borderWidth: 1.5, borderColor: C.lineaFuerte, borderRadius: RADIUS, paddingHorizontal: 14, minHeight: TOUCH, marginTop: 6, fontFamily: F.sans },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: { minHeight: 48, paddingHorizontal: 16, borderRadius: RADIUS, borderWidth: 1.5, borderColor: C.lineaFuerte, backgroundColor: C.blanco, justifyContent: "center" },
  chipOn: { backgroundColor: C.accion, borderColor: C.accion },
});
