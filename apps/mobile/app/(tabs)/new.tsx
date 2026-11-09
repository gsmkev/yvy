import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { RECORD_KINDS, t } from "@yvy/shared";
import { RECORD_ICON } from "../../src/ui/icons";
import { Header, styles as k } from "../../src/ui/kit";
import { C, TOUCH } from "../../src/ui/theme";

/** Siete botones grandes: el registro arranca con un toque (PRD §7: ≤ 4 toques más la foto). */
export default function NewRecord() {
  return (
    <ScrollView style={k.screen} contentContainerStyle={k.pad}>
      <Header eyebrow={t("app.newRecord")} title={t("app.chooseKind")} />
      <View style={s.grid}>
        {RECORD_KINDS.map((kind) => {
          const Icon = RECORD_ICON[kind];
          return (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityLabel={t(`recordKinds.${kind}`)}
              style={({ pressed }) => [
                s.tile,
                kind === "note" && s.wide,
                pressed && { transform: [{ scale: 0.97 }], backgroundColor: C.papel },
              ]}
              onPress={() => router.push({ pathname: "/record/[kind]", params: { kind } })}
            >
              <View style={s.iconBox}>
                <Icon size={28} color={C.accion} strokeWidth={2} />
              </View>
              <Text style={s.label}>{t(`recordKinds.${kind}`)}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: "48.5%",
    minHeight: TOUCH * 2.2,
    justifyContent: "space-between",
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.linea,
    borderRadius: 14,
    padding: 16,
  },
  wide: {
    width: "100%",
    minHeight: TOUCH + 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 14,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#E7EDD9",
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 17, fontWeight: "600", color: C.surco, marginTop: 10 },
});
