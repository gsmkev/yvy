/** Opciones comunes de encabezado para todas las pantallas de la pila de navegación. */
import { Pressable } from "react-native";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { t } from "@yvy/shared";
import { Text } from "./kit/controls";
import { C, F } from "./theme";

/** Volver cuando la pantalla se abrió directo (enlace, recarga) y no hay una anterior en la pila: lleva al inicio. */
function BackToHome() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("ui.common.back")} onPress={() => router.replace("/")} hitSlop={8} style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", opacity: pressed ? 0.6 : 1 })}>
      <ChevronLeft size={24} color={C.tinta} strokeWidth={2.2} />
      <Text style={{ fontFamily: F.sansMedium, fontSize: 17, color: C.tinta }}>{t("ui.common.back")}</Text>
    </Pressable>
  );
}

/** Encabezado de las pantallas apiladas: sin título (cada pantalla trae el suyo) y con transición corta. */
export const STACK_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: C.papel },
  headerShadowVisible: false,
  headerTintColor: C.tinta,
  headerTitleStyle: { fontFamily: F.sansSemi, fontSize: 18 },
  contentStyle: { backgroundColor: C.papel },
  animationDuration: 200,
} as const;

/** `screenOptions` de un Stack con encabezado: las opciones comunes más el botón Volver cuando no hay pantalla anterior. */
export const stackScreenOptions = ({ navigation }: { navigation: { canGoBack: () => boolean } }) => ({
  ...STACK_SCREEN_OPTIONS,
  headerLeft: navigation.canGoBack() ? undefined : () => <BackToHome />,
});
