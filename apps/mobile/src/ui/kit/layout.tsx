/** Cuerpo de un paso con acción fija y grupos de opciones. */
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { s } from "./styles";

/** Cuerpo de un paso: el contenido se desplaza y la acción principal queda fija abajo, siempre a la vista (también con el teclado abierto o con textos largos). */
export function ScreenBody({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={[s.footer, { paddingBottom: Math.max(12, insets.bottom) }]}>{footer}</View> : null}
    </View>
  );
}

/** Agrupa opciones de una sola respuesta para que TalkBack diga "opción 2 de 4" y el nombre del grupo. */
export function RadioGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      {children}
    </View>
  );
}
