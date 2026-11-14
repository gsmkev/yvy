import { StyleSheet, View } from "react-native";
import { Text } from "./kit";
import { C, F, T } from "./theme";

/** Una cifra con su etiqueta y, si cambia lo que se entiende, una línea de contexto. Sin tarjeta ni borde. */
export function Stat({ label, value, unit, note, tone }: { label: string; value: string | number; unit?: string; note?: string; tone?: "danger" }) {
  return (
    <View style={st.stat} accessible accessibilityLabel={[label, `${value}${unit ? ` ${unit}` : ""}`, note].filter(Boolean).join(". ")}>
      <Text style={T.small}>{label}</Text>
      <Text style={[st.value, tone === "danger" && { color: C.peligro }]}>
        {value}
        {unit ? <Text style={st.unit}> {unit}</Text> : null}
      </Text>
      {note ? <Text style={T.small}>{note}</Text> : null}
    </View>
  );
}

/** Cifras en dos columnas. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  return <View style={st.grid}>{children}</View>;
}

const st = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 20, marginTop: 8 },
  stat: { flexBasis: "46%", flexGrow: 1, minWidth: 140 },
  value: { fontFamily: F.serif, fontSize: 28, lineHeight: 34, color: C.tinta, marginTop: 2 },
  unit: { fontFamily: F.sans, fontSize: 15, color: C.tinta2 },
});
