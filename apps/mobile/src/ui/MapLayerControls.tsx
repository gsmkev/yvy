import { Pressable, StyleSheet, Text, View } from "react-native";
import { NDVI_RAMP, t } from "@yvy/shared";
import type { MapLayer } from "../lib/offline";
import { C, F, RADIUS, T } from "./theme";

/** Dos opciones de texto sobre fondo papel: Satélite / Vigor. La elegida va en negrita y subrayada. */
export function LayerSwitch({ value, onChange }: { value: MapLayer; onChange: (l: MapLayer) => void }) {
  const options: { id: MapLayer; label: string }[] = [
    { id: "true_color", label: t("ui.layerSatellite") },
    { id: "ndvi", label: t("ui.layerNdvi") },
  ];
  return (
    <View style={st.switch} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.id)}
            hitSlop={6}
            style={st.option}
          >
            <Text style={[T.smallMedium, on ? st.on : null]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Leyenda compacta del vigor: rampa y fecha de la imagen. */
export function NdviLegend({ acquiredAt, missing }: { acquiredAt: number | null; missing: boolean }) {
  if (missing) {
    return (
      <View style={st.legend}>
        <Text style={T.small}>{t("app.ndviNone")}</Text>
      </View>
    );
  }
  return (
    <View style={st.legend}>
      <View style={st.ramp}>
        {NDVI_RAMP.map((c) => (
          <View key={c} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </View>
      <View style={st.labels}>
        <Text style={st.label}>{t("ui.ndviLegendLow")}</Text>
        <Text style={st.label}>{t("ui.ndviLegendHigh")}</Text>
      </View>
      {acquiredAt !== null && (
        <Text style={[st.label, { marginTop: 4 }]}>
          {t("app.ndviDate", { date: new Date(acquiredAt).toLocaleDateString("es-PY", { day: "numeric", month: "short", year: "numeric" }) })}
        </Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  switch: { flexDirection: "row", gap: 24, backgroundColor: C.papel, borderRadius: RADIUS, paddingHorizontal: 14, alignSelf: "flex-start" },
  option: { minHeight: 48, justifyContent: "center" },
  on: { fontFamily: F.sansSemi, color: C.tinta, textDecorationLine: "underline", textDecorationColor: C.accion },
  legend: { backgroundColor: C.papel, borderRadius: RADIUS, paddingHorizontal: 14, paddingVertical: 10, alignSelf: "flex-start", width: 220 },
  ramp: { flexDirection: "row", height: 10, borderRadius: 3, overflow: "hidden" },
  labels: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  label: { fontFamily: F.sans, fontSize: 13, lineHeight: 17, color: C.tinta2 },
});
