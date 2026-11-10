import { useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { t } from "@yvy/shared";
import { setSelectedFarm, useFarmChoice } from "../lib/farmFilter";
import { Row } from "./kit";
import { T, TOUCH } from "./theme";

/** "Estancia San Pedro · cambiar". No muestra nada si hay una sola estancia. Al tocar, lista las demás. */
export function FarmLine({ style }: { style?: StyleProp<ViewStyle> }) {
  const { options, current } = useFarmChoice();
  const [open, setOpen] = useState(false);
  if (!current) return null;
  return (
    <View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("app.farmChange", { name: current.name })}
        onPress={() => setOpen((o) => !o)}
        style={st.line}
      >
        <Text style={T.smallMedium} numberOfLines={1}>
          {t("app.farmChange", { name: current.name })}
        </Text>
      </Pressable>
      {open && (
        <View>
          {options.map((f) => (
            <Row
              key={f.id}
              title={f.name}
              selected={f.id === current.id}
              onPress={() => {
                setSelectedFarm(f.id);
                setOpen(false);
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  line: { minHeight: TOUCH - 8, justifyContent: "center" },
});
