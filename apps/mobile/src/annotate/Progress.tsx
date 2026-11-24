import { View } from "react-native";
import { t } from "@yvy/shared";
import { Text } from "../ui/kit";
import { C, T } from "../ui/theme";
import { st } from "./styles";

export function Progress({ i, n }: { i: number; n: number }) {
  return (
    <View style={st.progressWrap} accessibilityLabel={t("app.stepOf", { i: i + 1, n })}>
      <View style={st.progress}>
        {Array.from({ length: n }, (_, j) => (
          <View key={j} style={[st.progressDot, j <= i && { backgroundColor: C.accion }]} />
        ))}
      </View>
      <Text style={[T.small, { marginTop: 6 }]}>{t("app.stepOf", { i: i + 1, n })}</Text>
    </View>
  );
}
