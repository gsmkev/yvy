import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { RECORD_KINDS, t } from "@yvy/shared";
import { KIND_ICON } from "../../src/lib/forms";
import { H1, styles as k } from "../../src/ui/kit";
import { C, TOUCH } from "../../src/ui/theme";

export default function NewRecord() {
  return (
    <ScrollView style={k.screen} contentContainerStyle={[k.pad, s.grid]}>
      <H1>{t("app.chooseKind")}</H1>
      {RECORD_KINDS.map((kind) => (
        <Pressable
          key={kind}
          accessibilityRole="button"
          accessibilityLabel={t(`recordKinds.${kind}`)}
          style={({ pressed }) => [s.tile, pressed && { opacity: 0.8 }]}
          onPress={() => router.push({ pathname: "/record/[kind]", params: { kind } })}
        >
          <Text style={s.icon}>{KIND_ICON[kind]}</Text>
          <Text style={s.label}>{t(`recordKinds.${kind}`)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  grid: { gap: 10 },
  tile: {
    minHeight: TOUCH + 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: C.white,
    borderRadius: 14,
    paddingHorizontal: 18,
  },
  icon: { fontSize: 30 },
  label: { fontSize: 20, fontWeight: "600", color: C.surco },
});
